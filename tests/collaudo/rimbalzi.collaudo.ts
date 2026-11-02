// Collaudo: percorsi automatici dei lead (ex Keap) con server SMTP finto e orologio simulato.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/automazioni.collaudo.ts
import net from "node:net";

// ── server SMTP finto: raccoglie le email inviate ─────────────────────────
const posta: { a: string[]; da: string; dati: string }[] = [];
const smtp = net.createServer((s) => {
  let inData = false, buf = "", rcpt: string[] = [], busta = "";
  s.write("220 finto\r\n");
  s.on("data", (d) => {
    buf += d.toString();
    if (inData) {
      const i = buf.indexOf("\r\n.\r\n");
      if (i < 0) return;
      posta.push({ a: rcpt, da: busta, dati: buf.slice(0, i) });
      buf = buf.slice(i + 5); inData = false; rcpt = [];
      s.write("250 ok\r\n");
    }
    let j;
    while (!inData && (j = buf.indexOf("\r\n")) >= 0) {
      const riga = buf.slice(0, j); buf = buf.slice(j + 2);
      const c = riga.slice(0, 4).toUpperCase();
      if (c === "EHLO") s.write("250-finto\r\n250 AUTH PLAIN LOGIN\r\n");
      else if (c === "AUTH") s.write("235 ok\r\n");
      else if (c === "MAIL") { busta = riga.match(/<(.*)>/)?.[1] ?? ""; s.write("250 ok\r\n"); }
      else if (c === "RCPT") { rcpt.push(riga.match(/<(.+)>/)?.[1] ?? ""); s.write("250 ok\r\n"); }
      else if (c === "DATA") { inData = true; s.write("354 vai\r\n"); }
      else if (c === "QUIT") { s.write("221 ciao\r\n"); s.end(); }
      else s.write("250 ok\r\n");
    }
  });
});

import { prisma } from "../../src/lib/prisma";
import { accodaCampagna, eseguiCampagne, contaDestinatari, filtriDi } from "../../src/lib/campagne/motore";
import { controllaRimbalzi, ultimoEsitoRimbalzi } from "../../src/lib/mail/rimbalzi-server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
// casella aziendale simulata: i "mancato recapito" che arrivano
const casella: { uid: number; sorgente: string }[] = [];
(globalThis as { __casellaFinta?: unknown }).__casellaFinta = async (daUid: number | null) => casella.filter((m) => !daUid || m.uid > daUid);
const rimbalzo = (uid: number, a: string, codice: string | null, status = "5.1.1", diag = "550 5.1.1 User unknown") => casella.push({ uid, sorgente:
  `From: MAILER-DAEMON@mail.gruppopec.com\nSubject: Undelivered Mail Returned to Sender\nContent-Type: multipart/report; report-type=delivery-status; boundary="B"\n\n--B\nContent-Type: message/delivery-status\n\nFinal-Recipient: rfc822; ${a}\nAction: failed\nStatus: ${status}\nDiagnostic-Code: smtp; ${diag}\n\n--B\nContent-Type: text/rfc822-headers\n\n${codice ? `X-CRM-Invio: ${codice}\n` : ""}Subject: prova\n--B--\n` });
let orologio = new Date("2026-11-03T09:00:00Z");
const ora = () => orologio;

async function main() {
  await new Promise<void>((r) => smtp.listen(2535, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2535", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "CampagnaInvio","Campagna","Lead","Cliente","Configurazione","Utente","Brand" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const cl = (nome: string, email: string) => prisma.cliente.create({ data: { nome, email, brandId: brand.id } });
  const mario = await cl("Mario", "mario.rossii@gmail.com");
  const anna = await cl("Anna", "anna@libero.it");
  const luca = await cl("Luca", "luca@verdi.it");
  const camp = await prisma.campagna.create({ data: { nome: "Promo", oggetto: "Ciao {nome}", testo: "Testo", tracciamento: false } });

  console.log("1. L'invio porta il codice e i rimbalzi tornano alla casella aziendale");
  await accodaCampagna(camp.id);
  const e1 = await eseguiCampagne({ adesso: ora });
  verifica(e1.inviate === 3 && posta.length === 3, "3 email partite", e1);
  const pm = posta.find((p) => p.a[0] === "mario.rossii@gmail.com")!;
  const codMario = /X-CRM-Invio: (c-[\w-]+)/i.exec(pm.dati)?.[1];
  verifica(!!codMario && pm.da === "crm@gruppopec.com", "intestazione X-CRM-Invio e mittente della busta = casella aziendale", { codMario, busta: pm.da });

  console.log("2. Arrivano i rimbalzi: indirizzo inesistente (con codice) e casella piena (senza codice)");
  rimbalzo(101, "mario.rossii@gmail.com", codMario!);
  rimbalzo(102, "anna@libero.it", null, "5.2.2", "552 5.2.2 Mailbox full");
  casella.push({ uid: 103, sorgente: "From: Luca <luca@verdi.it>\nSubject: Re: Promo\n\nGrazie, mi interessa!" });
  const r1 = await controllaRimbalzi({ forza: true, adesso: ora });
  verifica(r1?.controllati === 3 && r1.rimbalzi === 2, "lette 3 email, 2 rimbalzi (la risposta di Luca no)", r1);
  const im = await prisma.campagnaInvio.findFirstOrThrow({ where: { clienteId: mario.id } });
  const ia = await prisma.campagnaInvio.findFirstOrThrow({ where: { clienteId: anna.id } });
  verifica(im.stato === "RIMBALZATA" && im.motivo === "indirizzo inesistente" && ia.stato === "RIMBALZATA" && ia.motivo === "casella del cliente piena", "invii segnati come rimbalzati con il motivo", { im: im.stato, ia: ia.stato });
  const m2 = await prisma.cliente.findUniqueOrThrow({ where: { id: mario.id } }), a2 = await prisma.cliente.findUniqueOrThrow({ where: { id: anna.id } });
  verifica(m2.emailRimbalzata === "mario.rossii@gmail.com" && a2.emailRimbalzata === null, "indirizzo inesistente bloccato; la casella piena no (si riprova)");
  verifica((await ultimoEsitoRimbalzi())?.rimbalzi === 2, "esito salvato per la pagina Email automatiche");

  console.log("3. Non si rilegge due volte e si rispetta l'intervallo di 10 minuti");
  verifica((await controllaRimbalzi({ adesso: ora })) === null, "entro 10 minuti: non ricontrolla");
  orologio = new Date(orologio.getTime() + 11 * 60_000);
  const r2 = await controllaRimbalzi({ adesso: ora });
  verifica(r2?.controllati === 0, "dopo 10 minuti: nessuna email nuova da rileggere", r2);

  console.log("4. La campagna dopo non scrive più all'indirizzo sbagliato");
  const camp2 = await prisma.campagna.create({ data: { nome: "Promo 2", oggetto: "Ciao", testo: "T", tracciamento: false } });
  const conti = await contaDestinatari(filtriDi(camp2));
  verifica(conti.raggiungibili === 2 && conti.rimbalzati === 1, "conteggio: 2 raggiungibili, 1 con email rimbalzata", conti);
  verifica((await accodaCampagna(camp2.id)) === 2, "in coda solo Anna e Luca");

  console.log("5. Corretto l'indirizzo, si torna a scrivergli");
  await prisma.cliente.update({ where: { id: mario.id }, data: { email: "mario.rossi@gmail.com" } });
  verifica((await accodaCampagna(camp2.id)) === 1, "Mario rientra con l'indirizzo giusto");

  console.log("6. Rimbalzo di un'email automatica del lead");
  const lead = await prisma.lead.create({ data: { nome: "Paolo", email: "paolo@inesistente.it", brandId: brand.id } });
  const em = await prisma.emailLead.create({ data: { leadId: lead.id, chiave: "request-received", categoria: "CLIENTE", oggetto: "Grazie", testo: "t", html: "h", stato: "INVIATA", a: "paolo@inesistente.it" } });
  rimbalzo(104, "paolo@inesistente.it", `l-${em.id}`, "5.1.2", "Host or domain name not found");
  await controllaRimbalzi({ forza: true, adesso: ora });
  const em2 = await prisma.emailLead.findUniqueOrThrow({ where: { id: em.id } });
  const l2 = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  verifica(em2.stato === "RIMBALZATA" && em2.motivo === "dominio sbagliato o inesistente" && l2.emailRimbalzata === "paolo@inesistente.it", "email del lead rimbalzata, indirizzo del lead bloccato");

  console.log("7. Casella non raggiungibile: nessun blocco, errore scritto");
  (globalThis as { __casellaFinta?: unknown }).__casellaFinta = async () => { throw new Error("connect ECONNREFUSED 1.2.3.4:993"); };
  const r3 = await controllaRimbalzi({ forza: true, adesso: ora });
  verifica(r3?.motivo?.includes("casella non leggibile") && r3.motivo.includes("ECONNREFUSED"), "esito con il motivo, nessuna eccezione", r3);

  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  smtp.close();
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
