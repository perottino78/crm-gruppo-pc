// Collaudo: consumo del database (calcolatore e avvisi) con un'API di Neon simulata e un server SMTP finto.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/consumi-database.collaudo.ts
import net from "node:net";

// ── server SMTP finto: raccoglie le email inviate ─────────────────────────
const posta: { a: string[]; dati: string }[] = [];
const smtp = net.createServer((s) => {
  let inData = false, buf = "", rcpt: string[] = [];
  s.write("220 finto\r\n");
  s.on("data", (d) => {
    buf += d.toString();
    if (inData) {
      const i = buf.indexOf("\r\n.\r\n");
      if (i < 0) return;
      posta.push({ a: rcpt, dati: buf.slice(0, i) });
      buf = buf.slice(i + 5); inData = false; rcpt = [];
      s.write("250 ok\r\n");
    }
    let j;
    while (!inData && (j = buf.indexOf("\r\n")) >= 0) {
      const riga = buf.slice(0, j); buf = buf.slice(j + 2);
      const c = riga.slice(0, 4).toUpperCase();
      if (c === "EHLO") s.write("250-finto\r\n250 AUTH PLAIN LOGIN\r\n");
      else if (c === "AUTH") s.write("235 ok\r\n");
      else if (c === "RCPT") { rcpt.push(riga.match(/<(.+)>/)?.[1] ?? ""); s.write("250 ok\r\n"); }
      else if (c === "DATA") { inData = true; s.write("354 vai\r\n"); }
      else if (c === "QUIT") { s.write("221 ciao\r\n"); s.end(); }
      else s.write("250 ok\r\n");
    }
  });
});


import http from "node:http";
const GB = 1024 ** 3;
let consumo = { compute_time_seconds: 20 * 3600, data_transfer_bytes: 2 * GB, synthetic_storage_size: GB / 4 };
const neon = http.createServer((req, res) => {
  if (req.headers.authorization !== "Bearer napi_buona") { res.writeHead(401); res.end("{}"); return; }
  if (!req.url?.startsWith("/projects/dry-frog-66834498")) { res.writeHead(404); res.end("{}"); return; }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ project: { id: "dry-frog-66834498", consumption_period_start: "2026-11-01T00:00:00Z", consumption_period_end: "2026-12-01T00:00:00Z", ...consumo } }));
});

import { prisma } from "../../src/lib/prisma";
import { controllaConsumi, configConsumi, ultimaLettura, misureInterne } from "../../src/lib/database/consumi-server";
import { salvaConsumi } from "../../src/app/database-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const x = (e as { digest?: string }).digest ?? ""; if (!x.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(x.split(";")[2] ?? ""); } };

async function main() {
  await new Promise<void>((r) => smtp.listen(2537, r));
  await new Promise<void>((r) => neon.listen(2538, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2537", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x", NEON_API_BASE: "http://127.0.0.1:2538" });
  await prisma.$executeRawUnsafe('TRUNCATE "Configurazione","Utente" CASCADE');
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const tel = await prisma.utente.create({ data: { nome: "Cristina", email: "cri@x.it", username: "cri", ruolo: "TELEFONISTA" } });

  console.log("1. Chiave di Neon: provata prima di salvarla");
  g.__utente = tel;
  verifica((await dove(salvaConsumi(fd({ apiKey: "napi_buona" }))))?.includes("errore="), "una telefonista non può");
  g.__utente = ugo;
  const no = await dove(salvaConsumi(fd({ apiKey: "napi_sbagliata", budget: "30" })));
  verifica(no?.includes("rifiuta") && !(await configConsumi()).haChiave, "chiave sbagliata: non salvata, messaggio chiaro", no);
  const si = await dove(salvaConsumi(fd({ apiKey: "napi_buona", budget: "30", piano: "LAUNCH", destinatari: "" })));
  const cfg = await configConsumi();
  const cifrata = (await prisma.configurazione.findUnique({ where: { chiave: "neon_api_key" } }))?.valore ?? "";
  verifica(si?.includes("ok=") && cfg.haChiave && cfg.budget === 30 && !cifrata.includes("napi_buona"), "chiave buona salvata cifrata, budget 30", { si, cfg });
  const l = await ultimaLettura();
  verifica(l?.stima.cuOre === 20 && l.stima.trasferimentoGB === 2, "prima lettura salvata subito", l?.stima);

  console.log("2. Controllo periodico e avvisi");
  const adesso = new Date("2026-11-16T00:00:00Z");
  let r = await controllaConsumi({ adesso, forza: true });
  verifica((r as { livello?: string }).livello === "ok" && posta.length === 0, "consumi bassi: nessuna email", r);
  consumo = { ...consumo, compute_time_seconds: 130 * 3600 }; // ~29 $ previsti con budget 30 → attenzione
  r = await controllaConsumi({ adesso: new Date(adesso.getTime() + 2 * 3600_000) });
  verifica((r as { livello?: string }).livello === "attenzione" && posta.length === 1 && posta[0].a.includes("ugo@x.it"), "vicino al budget: email agli amministratori", r);
  r = await controllaConsumi({ adesso: new Date(adesso.getTime() + 4 * 3600_000) });
  verifica(posta.length === 1, "stesso livello lo stesso giorno: niente doppioni", r);
  r = await controllaConsumi({ adesso: new Date(adesso.getTime() + 4 * 3600_000 + 10 * 60_000) });
  verifica((r as { motivo?: string }).motivo === "letto da poco", "al massimo una lettura all'ora", r);
  consumo = { ...consumo, compute_time_seconds: 200 * 3600 };
  r = await controllaConsumi({ adesso: new Date(adesso.getTime() + 6 * 3600_000) });
  verifica((r as { livello?: string }).livello === "superato" && posta.length === 2, "peggiora (oltre il budget): nuova email subito", r);

  console.log("3. Misure interne");
  const m = await misureInterne();
  verifica(m.spazioBytes > 0 && m.piuLette.length > 0, "spazio e tabelle più lette", { spazio: m.spazioBytes, n: m.piuLette.length });

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  smtp.close(); neon.close();
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
