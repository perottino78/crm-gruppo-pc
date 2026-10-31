// Collaudo Fase 2: appuntamenti dei lead (conferme, lettere di vendita, promemoria, calendario, annullamento).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/appuntamenti.collaudo.ts
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
import { registraLead } from "../../src/lib/leadIngest";
import { registraEsito, assegnaVenditore, eseguiInviiScaduti, CHIAVE_ATTIVE } from "../../src/lib/automazioni/motore";
import { daOraRoma, perInput } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
let orologio = daOraRoma("2026-11-02T10:00")!; // lunedì
const ora = () => orologio;
const esegui = () => eseguiInviiScaduti({ adesso: ora });
/** Fa avanzare l'orologio di scadenza in scadenza finché il lead non ha più nulla in attesa */
async function finoAllaFine(leadId: string) {
  await esegui();
  for (let k = 0; k < 20; k++) {
    const j = await prisma.invioProgrammato.findFirst({ where: { leadId, stato: "IN_ATTESA" }, orderBy: { eseguiDopo: "asc" } });
    if (!j) break;
    if (j.eseguiDopo > orologio) orologio = new Date(j.eseguiDopo.getTime() + 60_000);
    await esegui();
  }
}
const inviate = async (leadId: string) => (await prisma.emailLead.findMany({ where: { leadId }, orderBy: [{ inviataIl: "asc" }, { createdAt: "asc" }] })).map((e) => `${e.chiave}:${e.stato}${e.inviataIl ? `@${perInput(e.inviataIl)}` : ""}`);
async function leadInTarget(nome: string, tel: string) {
  const r = await registraLead({ nome, telefono: tel, email: `${tel}@x.it`, fonte: "facebook", comune: "Rivoli", cap: "10098" });
  await prisma.invioProgrammato.updateMany({ where: { leadId: r!.id }, data: { stato: "ANNULLATO" } });
  await registraEsito({ leadId: r!.id, esito: "IN_TARGET" }, ora());
  await prisma.invioProgrammato.updateMany({ where: { leadId: r!.id, stato: "IN_ATTESA" }, data: { stato: "ANNULLATO" } });
  return r!.id;
}

async function main() {
  await new Promise<void>((r) => smtp.listen(2528, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2528", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","InvioProgrammato","EmailLead","Appuntamento","Lead","Cliente","Configurazione","Utente","Brand" CASCADE');
  await prisma.brand.create({ data: { nome: "P&C" } });
  await prisma.utente.create({ data: { nome: "Alessia Vaccaro", email: "a@x.it", username: "alessiav", ruolo: "TELEFONISTA" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "marco@gruppopec.com", telefono: "333 0000001", username: "mpiccatti", ruolo: "COMMERCIALE" } });
  const roberto = await prisma.utente.create({ data: { nome: "Roberto Marongiu", email: "roberto@gruppopec.com", username: "mroberto", ruolo: "COMMERCIALE" } });
  const senzaMail = await prisma.utente.create({ data: { nome: "Paolo Salvato", email: "psalvato@senza-email.invalid", username: "psalvato", ruolo: "COMMERCIALE" } });
  await prisma.configurazione.create({ data: { chiave: CHIAVE_ATTIVE, valore: "1" } });

  console.log("1. Appuntamento in showroom fra 5 giorni, venditore scelto subito");
  const a = await leadInTarget("Anna Bianchi", "3401");
  const quando1 = daOraRoma("2026-11-07T10:00")!; // sabato
  const r1 = await registraEsito({ leadId: a, esito: "APPUNTAMENTO_SHOWROOM", data: quando1, venditoreId: marco.id, note: "Vuole anche le zanzariere", utenteNome: "Alessia" }, ora());
  verifica(r1.ok, "esito registrato", r1);
  const la = await prisma.lead.findUniqueOrThrow({ where: { id: a }, include: { clienteGenerato: true } });
  const app = await prisma.appuntamento.findUniqueOrThrow({ where: { id: la.appuntamentoId! } });
  verifica(la.clienteGenerato?.responsabileId === marco.id && app.utenteId === marco.id && app.dataOra.getTime() === quando1.getTime() && app.luogo?.includes("Rosta") && app.stato === "PROGRAMMATO", "cliente creato e appuntamento nel calendario di Marco", { app, cliente: la.clienteGenerato });
  await finoAllaFine(a);
  const ea = await inviate(a);
  verifica(ea.join() === [
    "appointment-confirmed-contact:INVIATA@2026-11-02T10:00", "appointment-confirmed-seller:INVIATA@2026-11-02T10:00",
    "sales-letter-1:INVIATA@2026-11-03T08:01", "sales-letter-2:INVIATA@2026-11-04T08:01", "sales-letter-3:INVIATA@2026-11-05T08:01",
    "appointment-reminder-contact:INVIATA@2026-11-06T10:01", "appointment-reminder-seller:INVIATA@2026-11-06T10:01",
  ].join(), "conferme subito, lettere mar-mer-gio, la 4ª saltata (giorno del promemoria), promemoria venerdì", ea);
  const conferma = await prisma.emailLead.findFirstOrThrow({ where: { leadId: a, chiave: "appointment-confirmed-seller" } });
  verifica(conferma.a === "marco@gruppopec.com" && conferma.testo.includes("Vuole anche le zanzariere"), "il venditore riceve la conferma con le note");
  verifica((await prisma.invioProgrammato.count({ where: { leadId: a, stato: "SALTATO" } })) === 1, "lettera 4 registrata come saltata");

  console.log("2. Appuntamento fissato la sera prima: solo la conferma, niente lettere né promemoria");
  orologio = daOraRoma("2026-11-09T18:00")!;
  const b = await leadInTarget("Bruno Neri", "3402");
  await registraEsito({ leadId: b, esito: "APPUNTAMENTO_CASA", data: daOraRoma("2026-11-10T09:00")!, venditoreId: marco.id, indirizzo: "Via Roma 1, Rivoli" }, ora());
  await finoAllaFine(b);
  verifica((await inviate(b)).length === 2 && (await prisma.invioProgrammato.count({ where: { leadId: b, stato: "SALTATO" } })) === 6, "2 conferme, 4 lettere e 2 promemoria saltati", await inviate(b));
  verifica((await prisma.emailLead.findFirstOrThrow({ where: { leadId: b, chiave: "appointment-confirmed-contact" } })).testo.includes("Via Roma 1, Rivoli"), "conferma con l'indirizzo di casa");

  console.log("3. Appuntamento senza venditore: avviso al centralino, poi assegnazione");
  orologio = daOraRoma("2026-11-16T09:00")!;
  const c = await leadInTarget("Carla Verdi", "3403");
  verifica((await registraEsito({ leadId: c, esito: "APPUNTAMENTO_CASA", data: daOraRoma("2026-11-20T15:00")!, indirizzo: " " }, ora())).ok, "a casa senza indirizzo scritto: usa CAP e comune del lead");
  await esegui();
  verifica((await inviate(c)).join() === "seller-assignment-requested:INVIATA@2026-11-16T09:00" && !(await prisma.lead.findUniqueOrThrow({ where: { id: c } })).appuntamentoId, "solo 'venditore da assegnare' al centralino, niente calendario", await inviate(c));
  orologio = daOraRoma("2026-11-16T11:00")!;
  verifica((await assegnaVenditore(c, roberto.id, "Alessia", ora())).ok, "venditore assegnato");
  await esegui();
  const lc = await prisma.lead.findUniqueOrThrow({ where: { id: c } });
  verifica(lc.appuntamentoId && (await inviate(c)).filter((x) => x.startsWith("appointment-confirmed")).length === 2, "conferme partite e appuntamento in calendario", await inviate(c));

  console.log("4. Cambio data: lo stesso appuntamento si sposta, il vecchio ciclo si annulla");
  const nuova = daOraRoma("2026-11-24T16:00")!;
  await registraEsito({ leadId: c, esito: "APPUNTAMENTO_CASA", data: nuova, venditoreId: roberto.id, indirizzo: "Via Po 5, Rivoli" }, ora());
  const app4 = await prisma.appuntamento.findMany({ where: { clienteId: (await prisma.cliente.findFirstOrThrow({ where: { leadOrigineId: c } })).id } });
  verifica(app4.length === 1 && app4[0].dataOra.getTime() === nuova.getTime() && app4[0].luogo === "Via Po 5, Rivoli", "un solo appuntamento, spostato", app4);
  verifica((await prisma.invioProgrammato.count({ where: { leadId: c, stato: "ANNULLATO", errore: "superato da un nuovo esito" } })) >= 1, "lettere del vecchio ciclo annullate");

  console.log("5. Annullamento: avviso al venditore e al centralino, appuntamento annullato in calendario");
  await esegui();
  await registraEsito({ leadId: c, esito: "APPUNTAMENTO_ANNULLATO", note: "imprevisto di famiglia" }, ora());
  await esegui();
  const e5 = await inviate(c);
  verifica(e5.some((x) => x.startsWith("appointment-cancelled-seller:INVIATA")) && e5.some((x) => x.startsWith("cancellation-follow-up-requested:INVIATA")), "E-15 e E-14 inviate", e5);
  verifica((await prisma.emailLead.findFirstOrThrow({ where: { leadId: c, chiave: "appointment-cancelled-seller" } })).a === "roberto@gruppopec.com", "avvisato il venditore giusto");
  verifica((await prisma.appuntamento.findUniqueOrThrow({ where: { id: app4[0].id } })).stato === "ANNULLATO", "appuntamento annullato nel calendario");
  verifica((await prisma.invioProgrammato.count({ where: { leadId: c, stato: "IN_ATTESA" } })) === 0, "nessuna lettera o promemoria in attesa");

  console.log("6. Controlli");
  const d = await registraLead({ nome: "Dario", telefono: "3404", fonte: "web" });
  await registraEsito({ leadId: d!.id, esito: "IN_TARGET" }, ora());
  verifica((await registraEsito({ leadId: d!.id, esito: "APPUNTAMENTO_CASA", data: daOraRoma("2026-11-25T10:00")! }, ora())).ok === false, "a casa senza indirizzo né comune: chiede l'indirizzo");
  verifica((await registraEsito({ leadId: d!.id, esito: "APPUNTAMENTO_SHOWROOM", data: daOraRoma("2026-11-01T10:00")! }, ora())).ok === false, "data già passata rifiutata");
  await registraEsito({ leadId: d!.id, esito: "APPUNTAMENTO_SHOWROOM", data: daOraRoma("2026-11-25T10:00")!, venditoreId: senzaMail.id }, ora());
  await esegui();
  const s6 = await prisma.emailLead.findFirstOrThrow({ where: { leadId: d!.id, chiave: "appointment-confirmed-seller" } });
  verifica(s6.stato === "SOPPRESSA" && s6.motivo === "il venditore non ha un'email valida", "venditore senza email: conferma non inviata, il resto prosegue", s6);

  smtp.close();
  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
