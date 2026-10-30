// Collaudo calendario: appuntamenti, ora di Roma, inviti via email (.ics) con server SMTP finto, link calendario personale.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/calendario.collaudo.ts
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

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d); } };

async function main() {
  await new Promise<void>((r) => smtp.listen(2526, r));
  const { prisma } = await import("../../src/lib/prisma");
  const K = await import("../../src/app/calendario-actions");
  const { eventiPeriodo } = await import("../../src/lib/calendario/server");
  const { inizioGiorno } = await import("../../src/lib/calendario/tempo");
  const { GET } = await import("../../src/app/api/calendario/[token]/route");

  await prisma.$executeRawUnsafe('TRUNCATE "Appuntamento","Rilievo","Posa","TaskPratica","CommessaEvento","FaseCommessa","Commessa","Preventivo","Cliente","Utente","Brand" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const tel = await prisma.utente.create({ data: { nome: "Cristina", email: "cristina@gruppopec.com", ruolo: "TELEFONISTA", passwordHash: "x" } });
  const comm = await prisma.utente.create({ data: { nome: "Pavel", email: "pavel@gruppopec.com", ruolo: "COMMERCIALE", passwordHash: "x" } });
  const comm2 = await prisma.utente.create({ data: { nome: "Luca", email: "luca@gruppopec.com", ruolo: "COMMERCIALE", passwordHash: "x" } });
  const cli = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", email: "mario@cliente.it", brandId: brand.id, indirizzo: "Via Roma 1", cap: "10090", comune: "Rosta", provincia: "TO" } });

  console.log("1. Senza invio email configurato");
  g.__utente = tel;
  const r1 = await redirectA(K.creaAppuntamento(fd({ clienteId: cli.id, utenteId: comm.id, dataOra: "2026-11-03T09:00", durataMin: "90", tipo: "COMMERCIALE" })));
  const a1 = await prisma.appuntamento.findFirstOrThrow();
  verifica(a1.dataOra.toISOString() === "2026-11-03T08:00:00.000Z", "le 9:00 di Roma sono salvate come 8:00 UTC (ora solare)", a1.dataOra);
  verifica(a1.utenteId === comm.id && a1.durataMin === 90 && a1.creatoDaNome === "Cristina", "la telefonista fissa l'appuntamento al commerciale");
  verifica(r1?.includes("non inviato") && !a1.invitoInviatoIl, "avvisa che l'invito non è partito", r1);

  console.log("2. Con SMTP: invito al commerciale e conferma al cliente");
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2526", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x", MAIL_FROM: "Gruppo P&C <crm@gruppopec.com>" });
  const r2 = await redirectA(K.creaAppuntamento(fd({ clienteId: cli.id, utenteId: comm.id, dataOra: "2026-07-14T15:30", tipo: "SOPRALLUOGO", invitaCliente: "on", note: "citofono Rossi" })));
  verifica(r2?.includes("Invito inviato a pavel@gruppopec.com, mario@cliente.it"), "invito a commerciale e cliente", r2);
  const mPavel = posta.find((m) => m.a.includes("pavel@gruppopec.com"));
  verifica(mPavel && /METHOD:REQUEST/.test(mPavel.dati) && /text\/calendar/.test(mPavel.dati), "l'email del commerciale contiene l'invito di calendario");
  verifica(mPavel && /DTSTART:20260714T133000Z/.test(mPavel.dati.replace(/=\r\n/g, "")), "nell'invito le 15:30 di luglio (ora legale) = 13:30 UTC");
  const mCli = posta.find((m) => m.a.includes("mario@cliente.it"));
  verifica(mCli && !/crm-gruppo-pc\.vercel\.app/.test(mCli.dati), "al cliente non arriva il link interno del CRM");

  console.log("3. Spostamento e cambio incaricato");
  const a2 = await prisma.appuntamento.findFirstOrThrow({ where: { tipo: "SOPRALLUOGO" } });
  posta.length = 0;
  await redirectA(K.modificaAppuntamento(fd({ id: a2.id, utenteId: comm2.id, dataOra: "2026-07-15T10:00", tipo: "SOPRALLUOGO", durataMin: "60", invitaCliente: "on" })));
  verifica(posta.some((m) => m.a.includes("pavel@gruppopec.com") && /METHOD:CANCEL/.test(m.dati)), "Pavel riceve l'annullamento");
  verifica(posta.some((m) => m.a.includes("luca@gruppopec.com") && /METHOD:REQUEST/.test(m.dati)), "Luca riceve il nuovo invito");
  verifica(posta.some((m) => m.a.includes("mario@cliente.it")), "il cliente riceve la nuova data");

  console.log("4. Annullamento");
  posta.length = 0;
  await redirectA(K.esitoAppuntamento(fd({ id: a2.id, stato: "ANNULLATO" })));
  verifica((await prisma.appuntamento.findUniqueOrThrow({ where: { id: a2.id } })).stato === "ANNULLATO", "stato annullato");
  verifica(posta.length === 2 && posta.every((m) => /METHOD:CANCEL/.test(m.dati)), "annullamento a incaricato e cliente", posta.map((m) => m.a));

  console.log("5. Calendario e link personale");
  const ev = await eventiPeriodo({ da: inizioGiorno("2026-11-02"), a: inizioGiorno("2026-11-09"), utenteId: comm.id });
  verifica(ev.length === 1 && ev[0].cliente === "ROSSI MARIO" && ev[0].luogo?.includes("Rosta"), "la settimana di Pavel mostra l'appuntamento con l'indirizzo del cliente", ev);
  g.__utente = comm;
  await redirectA(K.generaLinkCalendario(fd({})));
  const tok = (await prisma.utente.findUniqueOrThrow({ where: { id: comm.id } })).calendarioToken!;
  verifica(tok && tok.length >= 30, "link privato creato");
  const res = await GET(new Request("http://x") as never, { params: Promise.resolve({ token: tok }) });
  const ics = await res.text();
  verifica(res.status === 200 && /BEGIN:VCALENDAR/.test(ics) && /ROSSI MARIO/.test(ics) && /X-WR-CALNAME:CRM P&C — Pavel/.test(ics), "il link restituisce il calendario di Pavel");
  const bad = await GET(new Request("http://x") as never, { params: Promise.resolve({ token: "a".repeat(32) }) });
  verifica(bad.status === 404, "un link sbagliato non mostra nulla");

  smtp.close();
  console.log(`\n${ok} superati, ${ko} falliti`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
