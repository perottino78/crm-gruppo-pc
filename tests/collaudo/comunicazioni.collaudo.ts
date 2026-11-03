// Collaudo: comunicazioni interne al team (email, task, password provvisorie) con server SMTP finto.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/comunicazioni.collaudo.ts
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

import { prisma } from "../../src/lib/prisma";
import { inviaComunicazione, segnaComunicazione } from "../../src/app/comunicazioni-actions";
import { verificaPassword, hashPassword } from "../../src/lib/auth";
import { MODELLI_COMUNICAZIONE } from "../../src/lib/comunicazioni/testo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const modulo = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const leggibile = (s: string) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_t, h) => String.fromCharCode(parseInt(h, 16)));
const per = (email: string) => posta.filter((m) => m.a.includes(email));

async function main() {
  await new Promise<void>((r) => smtp.listen(2533, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2533", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "ComunicazioneDestinatario","Comunicazione","Configurazione","Utente" CASCADE');
  const vecchia = await hashPassword("vecchia123");
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@gruppopec.com", username: "uperottino", ruolo: "AMMINISTRATORE", passwordHash: vecchia } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco Zaccaro", email: "marketing@gruppopec.com", username: "mpec", ruolo: "MARKETING", ufficio: "MARKETING", passwordHash: vecchia } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "marco@gruppopec.com", username: "mpiccatti", ruolo: "COMMERCIALE", passwordHash: vecchia } });
  const cri = await prisma.utente.create({ data: { nome: "Cristina Rege", email: "cristina@gruppopec.com", username: "crege", ruolo: "TELEFONISTA", passwordHash: vecchia } });
  const pausa = await prisma.utente.create({ data: { nome: "Luca In Pausa", email: "luca@gruppopec.com", username: "luca", ruolo: "COMMERCIALE", stato: "PAUSA" } });
  const invito = MODELLI_COMUNICAZIONE.find((m) => m.chiave === "invito")!;

  console.log("1. Chi può mandare");
  g.__utente = marco;
  let r = await redirectA(inviaComunicazione(modulo({ oggetto: "x", testo: "y", destinatari: [cri.id] })));
  verifica(r?.includes("amministratore e il marketing") && posta.length === 0, "un commerciale non manda comunicazioni al team", r);
  g.__utente = rocco;
  r = await redirectA(inviaComunicazione(modulo({ oggetto: invito.oggetto, testo: invito.testo, destinatari: [marco.id], password: "1" })));
  verifica(r?.includes("Solo l'amministratore") && posta.length === 0, "Rocco non può generare password provvisorie", r);

  console.log("2. Prova a sé stessi");
  r = await redirectA(inviaComunicazione(modulo({ oggetto: "Riunione {nome}", testo: "Ciao {nome}, domani alle 9 riunione.", destinatari: [marco.id, cri.id], prova: "1" })));
  verifica(r?.includes("Prova mandata a marketing@gruppopec.com") && posta.length === 1 && per("marketing@gruppopec.com").length === 1, "la prova arriva solo a chi la manda", r);
  verifica(/Subject: \[PROVA\] Riunione Rocco/.test(posta[0].dati) && (await prisma.comunicazione.count()) === 0, "con [PROVA] nell'oggetto e senza finire nello storico");

  console.log("3. Rocco manda una comunicazione con task");
  r = await redirectA(inviaComunicazione(modulo({ oggetto: "Nuovo listino tende", testo: "Ciao {nome},\n\nda lunedì vale il **nuovo listino**.", destinatari: [marco.id, cri.id, pausa.id], conTask: "1", titoloTask: "Leggi il nuovo listino", scadenzaTask: "2026-11-10" })));
  verifica(r?.includes("inviata a 2 di 2") && r.includes("task"), "inviata alle 2 persone attive (chi è in pausa no)", r);
  verifica(leggibile(per("marco@gruppopec.com")[0].dati).includes("Ciao Marco,") && leggibile(per("cristina@gruppopec.com")[0].dati).includes("Ciao Cristina,"), "ognuno con il suo nome");
  const com = (await prisma.comunicazione.findFirst({ where: { oggetto: "Nuovo listino tende" }, include: { destinatari: true } }))!;
  verifica(com.conTask && com.destinatari.length === 2 && com.destinatari.every((d) => d.stato === "INVIATA" && !d.fattoIl), "un task per ognuno, da fare");

  console.log("4. Marco legge e segna fatto");
  const rigaMarco = com.destinatari.find((d) => d.utenteId === marco.id)!;
  g.__utente = cri;
  await redirectA(segnaComunicazione(modulo({ id: rigaMarco.id, cosa: "fatto" })));
  verifica(!(await prisma.comunicazioneDestinatario.findUnique({ where: { id: rigaMarco.id } }))?.fattoIl, "Cristina non può segnare il task di Marco");
  g.__utente = marco;
  await redirectA(segnaComunicazione(modulo({ id: rigaMarco.id, cosa: "fatto" })));
  const dopo = (await prisma.comunicazioneDestinatario.findUnique({ where: { id: rigaMarco.id } }))!;
  verifica(dopo.fattoIl && dopo.lettaIl, "Marco segna fatto (e risulta anche letta)");

  console.log("5. Ugo manda l'invito con le password provvisorie");
  g.__utente = ugo;
  posta.length = 0;
  r = await redirectA(inviaComunicazione(modulo({ oggetto: invito.oggetto, testo: invito.testo, destinatari: [marco.id, cri.id, ugo.id], password: "1", conTask: "1", titoloTask: invito.task! })));
  verifica(r?.includes("inviata a 3 di 3"), "invito mandato a 3 persone", r);
  const mailMarco = leggibile(per("marco@gruppopec.com")[0].dati);
  const pw = /Pec-[a-z]{4}[2-9]{2}/.exec(mailMarco)?.[0];
  verifica(pw && mailMarco.includes("mpiccatti") && mailMarco.includes("Ciao Marco"), "l'email di Marco ha nome utente e password provvisoria", pw);
  const marcoDopo = (await prisma.utente.findUnique({ where: { id: marco.id } }))!;
  verifica(pw && (await verificaPassword(pw, marcoDopo.passwordHash!)) && marcoDopo.mustChangePassword, "con quella password Marco entra e deve cambiarla");
  const ugoDopo = (await prisma.utente.findUnique({ where: { id: ugo.id } }))!;
  verifica(ugoDopo.passwordHash === vecchia && leggibile(per("ugo@gruppopec.com")[0].dati).includes("la tua password di sempre"), "la password di chi manda non si tocca");
  const salvata = (await prisma.comunicazione.findFirst({ where: { conPassword: true } }))!;
  verifica(salvata.testo.includes("{password}") && !/Pec-[a-z]{4}\d{2}/.test(salvata.testo), "nello storico non resta nessuna password");

  console.log("6. Posta che non parte: la password non cambia");
  process.env.SMTP_PORT = "2599";
  const criPrima = (await prisma.utente.findUnique({ where: { id: cri.id } }))!.passwordHash;
  r = await redirectA(inviaComunicazione(modulo({ oggetto: invito.oggetto, testo: invito.testo, destinatari: [cri.id], password: "1" })));
  verifica(r?.includes("inviata a 0 di 1"), "si vede che non è partita", r);
  verifica((await prisma.utente.findUnique({ where: { id: cri.id } }))!.passwordHash === criPrima, "Cristina tiene la password di prima (non resta chiusa fuori)");

  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
}

main().catch((e) => { console.error(e); ko++; }).finally(async () => { smtp.close(); await prisma.$disconnect(); process.exit(ko ? 1 : 0); });
