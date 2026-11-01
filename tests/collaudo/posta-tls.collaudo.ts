// Collaudo: posta con connessione sicura come sugli hosting veri. Server SMTP finti con certificati reali:
// certificato intestato a un altro nome, porta SSL contro STARTTLS, certificato autofirmato, password sbagliata.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/posta-tls.collaudo.ts
import net from "node:net";
import tls from "node:tls";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

// certificati: "fidato" (come quelli veri, intestato a localhost) e "autofirmato" (non riconosciuto)
const dir = path.join(os.tmpdir(), "crm-posta-tls");
if (!fs.existsSync(path.join(dir, "fidato.pem"))) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [n, cn] of [["fidato", "localhost"], ["autofirmato", "altro.invalid"]]) {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", `/CN=${cn}`, "-addext", `subjectAltName=DNS:${cn}`, "-keyout", path.join(dir, `${n}.key`), "-out", path.join(dir, `${n}.pem`)], { stdio: "ignore" });
  }
}
// il certificato "fidato" deve essere riconosciuto come quelli delle autorità vere: si riparte con NODE_EXTRA_CA_CERTS
if (!process.env.COLLAUDO_TLS) {
  // si aggiunge ai certificati già fidati dell'ambiente (es. quelli del proxy), non si sostituiscono
  const pacchetto = path.join(dir, "fidati.pem");
  const gia = process.env.NODE_EXTRA_CA_CERTS && fs.existsSync(process.env.NODE_EXTRA_CA_CERTS) ? fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS, "utf8") + "\n" : "";
  fs.writeFileSync(pacchetto, gia + fs.readFileSync(path.join(dir, "fidato.pem"), "utf8"));
  const r = spawnSync(process.execPath, process.execArgv.concat(process.argv.slice(1)), { stdio: "inherit", env: { ...process.env, COLLAUDO_TLS: "1", NODE_EXTRA_CA_CERTS: pacchetto } });
  process.exit(r.status ?? 1);
}
const cert = (n: string) => ({ key: fs.readFileSync(path.join(dir, `${n}.key`)), cert: fs.readFileSync(path.join(dir, `${n}.pem`)) });

// ── server SMTP: risponde in chiaro (con STARTTLS) o direttamente in SSL ──
const ricevute: { server: string; a: string }[] = [];
function sessione(s: net.Socket | tls.TLSSocket, nome: string, opz: { starttls?: ReturnType<typeof cert>; rifiuta?: boolean }, saluta = true) {
  let buf = "", inData = false, rcpt = "";
  if (saluta) s.write("220 finto\r\n");
  const suDati = (d: Buffer) => {
    buf += d.toString();
    if (inData) { const i = buf.indexOf("\r\n.\r\n"); if (i < 0) return; ricevute.push({ server: nome, a: rcpt }); buf = buf.slice(i + 5); inData = false; s.write("250 ok\r\n"); }
    let j;
    while (!inData && (j = buf.indexOf("\r\n")) >= 0) {
      const riga = buf.slice(0, j); buf = buf.slice(j + 2);
      const c = riga.slice(0, 4).toUpperCase();
      if (c === "EHLO") s.write(`250-finto\r\n${opz.starttls && !(s instanceof tls.TLSSocket) ? "250-STARTTLS\r\n" : ""}250 AUTH PLAIN LOGIN\r\n`);
      else if (c === "STAR" && opz.starttls) {
        s.write("220 vai\r\n");
        s.removeListener("data", suDati);
        const t = new tls.TLSSocket(s as net.Socket, { isServer: true, ...opz.starttls });
        sessione(t, nome, opz, false);
        return;
      }
      else if (c === "AUTH") s.write(opz.rifiuta ? "535 5.7.8 Incorrect authentication data\r\n" : "235 ok\r\n");
      else if (c === "RCPT") { rcpt = riga.match(/<(.+)>/)?.[1] ?? ""; s.write("250 ok\r\n"); }
      else if (c === "DATA") { inData = true; s.write("354 vai\r\n"); }
      else if (c === "QUIT") { s.write("221 ciao\r\n"); s.end(); }
      else s.write("250 ok\r\n");
    }
  };
  s.on("data", suDati);
  s.on("error", () => {});
}
const server: net.Server[] = [];
const ssl = (porta: number, nome: string, c: ReturnType<typeof cert>, rifiuta = false) => new Promise<void>((r) => { const x = tls.createServer(c, (s) => sessione(s, nome, { rifiuta })); x.on("tlsClientError", () => {}); server.push(x); x.listen(porta, r); });
const chiaro = (porta: number, nome: string, c: ReturnType<typeof cert>) => new Promise<void>((r) => { const x = net.createServer((s) => sessione(s, nome, { starttls: c })); server.push(x); x.listen(porta, r); });

import { prisma } from "../../src/lib/prisma";
import { cercaImpostazioni, postaAziendale, inviaMail } from "../../src/lib/mail/invio";
import { salvaPostaAziendale } from "../../src/app/posta-actions";
import { usaSsl } from "../../src/lib/mail/diagnosi";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent((d.split(";")[2] ?? "").replace(/\+/g, " ")); } };
const base = { utente: "crm@gruppopec.com", password: "x", mittente: "crm@gruppopec.com" };

async function main() {
  await ssl(2571, "ssl-fidato", cert("fidato"));
  await chiaro(2572, "starttls-fidato", cert("fidato"));
  await ssl(2573, "ssl-autofirmato", cert("autofirmato"));
  await ssl(2574, "ssl-password", cert("fidato"), true);
  for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PORT", "MAIL_FROM"]) delete process.env[k];
  await prisma.$executeRawUnsafe('TRUNCATE "Configurazione","Utente" CASCADE');
  const ugo = await prisma.utente.create({ data: { nome: "Ugo", email: "ugo@gruppopec.com", ruolo: "AMMINISTRATORE" } });
  g.__utente = ugo;

  console.log("1. Tutto giusto: funziona al primo colpo");
  const r1 = await cercaImpostazioni({ ...base, host: "localhost", porta: 2571, sicura: true }, "ugo@x.it");
  verifica(r1.inviata && r1.prove.length === 1, "SSL con certificato valido", r1.prove);

  console.log("2. Certificato intestato a un altro nome (hosting condiviso)");
  const r2 = await cercaImpostazioni({ ...base, host: "127.0.0.1", porta: 2571, sicura: true }, "ugo@x.it");
  verifica(r2.inviata && r2.casella?.host === "localhost" && !r2.casella.accettaCertificato, "il CRM legge il nome dal certificato e si collega in modo sicuro", r2.prove);

  console.log("3. Porta STARTTLS indicata come SSL");
  const r3 = await cercaImpostazioni({ ...base, host: "localhost", porta: 2572, sicura: true }, "ugo@x.it");
  verifica(r3.inviata && r3.casella?.porta === 2572 && !usaSsl(r3.casella!), "passa da solo a STARTTLS sulla stessa porta", r3.prove);
  verifica(ricevute.some((x) => x.server === "starttls-fidato"), "email di prova arrivata dal server STARTTLS");

  console.log("4. Certificato autofirmato");
  const r4 = await cercaImpostazioni({ ...base, host: "localhost", porta: 2573, sicura: true }, "ugo@x.it");
  verifica(!r4.inviata && r4.motivo?.includes("collega comunque") && r4.motivo.includes("dettaglio"), "senza permesso non si collega e spiega cosa fare", r4.motivo);
  const r5 = await cercaImpostazioni({ ...base, host: "localhost", porta: 2573, sicura: true }, "ugo@x.it", { accettaCertificato: true });
  verifica(r5.inviata && r5.casella?.accettaCertificato, "con \"collega comunque\" funziona (cifrata)", r5.prove);

  console.log("5. Password sbagliata: si ferma subito");
  const r6 = await cercaImpostazioni({ ...base, host: "localhost", porta: 2574, sicura: true }, "ugo@x.it");
  verifica(!r6.inviata && r6.prove.length === 1 && r6.motivo?.startsWith("email o password"), "nessun altro tentativo inutile", r6);

  console.log("6. Impostazioni › Posta aziendale: corregge e salva");
  const d1 = await dove(salvaPostaAziendale(fd({ utente: "crm@gruppopec.com", password: "segreta", host: "127.0.0.1", porta: "2572" })));
  const p = await postaAziendale();
  verifica(d1?.includes("posta=") && d1.includes("corrette in automatico"), "messaggio con le impostazioni corrette", d1);
  verifica(p?.host === "localhost" && p.porta === 2572 && p.sicura === false, "salvati il nome giusto e STARTTLS", p);
  const prima = ricevute.length;
  const e = await inviaMail({ a: ["cliente@x.it"], oggetto: "Ciao", testo: "t" });
  verifica(e.inviata && ricevute.length === prima + 1, "le email del CRM ora partono", e);
  const d2 = await dove(salvaPostaAziendale(fd({ utente: "crm@gruppopec.com", password: "segreta", host: "localhost", porta: "2573" })));
  verifica(d2?.includes("postaErrore=") && d2.includes("u=crm@gruppopec.com") && d2.includes("prove="), "non salvata: dati riproposti ed elenco delle prove", d2);
  verifica((await postaAziendale())?.porta === 2572, "la casella che funzionava resta");
  const d3 = await dove(salvaPostaAziendale(fd({ utente: "crm@gruppopec.com", password: "segreta", host: "localhost", porta: "2573", accettaCertificato: "on" })));
  verifica(d3?.includes("posta=") && (await postaAziendale())?.accettaCertificato === true, "con \"collega comunque\" salvata", d3);

  for (const s of server) s.close();
  await prisma.configurazione.deleteMany({ where: { chiave: { startsWith: "posta_" } } });
  await prisma.$disconnect();
  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
