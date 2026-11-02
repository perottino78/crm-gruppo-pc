// Collaudo: percorsi automatici dei lead (ex Keap) con server SMTP finto e orologio simulato.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/automazioni.collaudo.ts
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

import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { GET as feed } from "../../src/app/api/calendario/[token]/route";
import { inviaLinkCalendarioATutti } from "../../src/app/calendario-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const leggi = async (token: string, q = "") => { const r = await feed(new NextRequest(`http://localhost/api/calendario/${token}${q}`), { params: Promise.resolve({ token }) }); return { status: r.status, testo: await r.text() }; };

async function main() {
  await new Promise<void>((r) => smtp.listen(2531, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2531", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "Appuntamento","Cliente","Configurazione","Utente","Brand" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const T = (n: string) => `token-di-prova-${n}-abcdefghijk`;
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@gruppopec.com", username: "ugo", ruolo: "AMMINISTRATORE", calendarioToken: T("ugo") } });
  const tel = await prisma.utente.create({ data: { nome: "Alessia Vaccaro", email: "alessia@gruppopec.com", username: "alessia", ruolo: "TELEFONISTA", calendarioToken: T("ale") } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "marco@gruppopec.com", username: "marco", ruolo: "COMMERCIALE", calendarioToken: T("marco") } });
  const max = await prisma.utente.create({ data: { nome: "Massimo Giordano", email: "massimo@gruppopec.com", username: "max", ruolo: "COMMERCIALE" } });
  await prisma.utente.create({ data: { nome: "Ex collega", email: "ex@gruppopec.com", username: "ex", ruolo: "COMMERCIALE", stato: "DISATTIVATO", calendarioToken: T("ex") } });
  const cli = await prisma.cliente.create({ data: { nome: "Rossi Mario", brandId: brand.id } });
  const domani = new Date(Date.now() + 86400_000);
  await prisma.appuntamento.create({ data: { clienteId: cli.id, utenteId: marco.id, dataOra: domani, titolo: "Visita Rossi" } });
  await prisma.appuntamento.create({ data: { clienteId: cli.id, utenteId: max.id, dataOra: new Date(domani.getTime() + 7200_000), titolo: "Visita Bianchi" } });

  console.log("1. Il calendario personale");
  const m = await leggi(T("marco"));
  verifica(m.status === 200 && m.testo.includes("Visita Rossi") && !m.testo.includes("Visita Bianchi") && m.testo.includes("P&C ONE — Marco Piccatti"), "il commerciale vede solo i suoi impegni");
  verifica((await leggi(T("ex"))).status === 404, "il link di chi è disattivato non funziona più");
  verifica((await leggi("corto")).status === 404, "link inventato: non trovato");

  console.log("2. Colleghi e tutto il team");
  verifica((await leggi(T("marco"), `?persona=${max.id}`)).status === 403 && (await leggi(T("marco"), "?team=1")).status === 403, "un commerciale non vede i calendari degli altri");
  const p = await leggi(T("ale"), `?persona=${max.id}`);
  verifica(p.status === 200 && p.testo.includes("Visita Bianchi") && !p.testo.includes("Visita Rossi") && p.testo.includes("P&C ONE — Massimo Giordano"), "la telefonista aggiunge il calendario di un collega");
  const t = await leggi(T("ugo"), "?team=1");
  verifica(t.status === 200 && t.testo.includes("Visita Rossi · Marco Piccatti") && t.testo.includes("Visita Bianchi · Massimo Giordano") && t.testo.includes("tutto il team"), "l'amministratore vede tutto il team, con il nome di chi ha l'impegno");
  verifica((await leggi(T("ugo"), "?persona=inesistente")).status === 404, "collega inesistente: non trovato");

  console.log("3. L'amministratore manda a ognuno il suo link");
  g.__utente = marco;
  verifica((await redirectA(inviaLinkCalendarioATutti(fd({}))))?.includes("Solo l'amministratore") && posta.length === 0, "un commerciale non può mandarli");
  g.__utente = ugo;
  const r = await redirectA(inviaLinkCalendarioATutti(fd({})));
  verifica(r?.includes("mandato a 4 persone"), "mandato ai 4 attivi (non al disattivato)", r);
  const maxDopo = await prisma.utente.findUniqueOrThrow({ where: { id: max.id } });
  verifica(!!maxDopo.calendarioToken && (await prisma.utente.findUniqueOrThrow({ where: { id: marco.id } })).calendarioToken === T("marco"), "creato il link a chi non l'aveva, quello vecchio non cambia");
  const aMax = posta.find((x) => x.a[0] === "massimo@gruppopec.com")?.dati.replace(/=\r?\n/g, "") ?? "";
  verifica(aMax.includes("calendar.google.com") && aMax.includes(maxDopo.calendarioToken!.slice(0, 10)), "nell'email il pulsante Google con il suo link");
  verifica(!posta.some((x) => x.a[0] === "ex@gruppopec.com"), "niente email al disattivato");
  const uno = await redirectA(inviaLinkCalendarioATutti(fd({ utenteId: tel.id })));
  verifica(uno?.includes("mandato a 1 persona") && posta.at(-1)?.a[0] === "alessia@gruppopec.com", "si può mandare anche a una persona sola");

  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  smtp.close();
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
