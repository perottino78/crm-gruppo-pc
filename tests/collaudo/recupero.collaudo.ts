// Collaudo: recupero dei lead persi dopo N mesi (promozione, di nuovo in coda al centralino, massimo 2 recuperi).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/recupero.collaudo.ts
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
import { registraEsito, eseguiInviiScaduti, CHIAVE_ATTIVE, CHIAVE_MESI_RECUPERO, CHIAVE_PROMO_TESTO, CHIAVE_PROMO_FINO } from "../../src/lib/automazioni/motore";
import { daOraRoma, perInput } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
let orologio = daOraRoma("2026-11-02T10:00")!; // lunedì
const ora = () => orologio;
const esegui = () => eseguiInviiScaduti({ adesso: ora });
const imposta = (chiave: string, valore: string) => prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });
/** salta al prossimo invio in attesa del lead e lo esegue */
async function prossimo(leadId: string) {
  const j = await prisma.invioProgrammato.findFirst({ where: { leadId, stato: "IN_ATTESA" }, orderBy: { eseguiDopo: "asc" } });
  if (!j) return null;
  if (j.eseguiDopo > orologio) orologio = new Date(j.eseguiDopo.getTime() + 60_000);
  await esegui();
  return j;
}
const lead = (id: string) => prisma.lead.findUniqueOrThrow({ where: { id } });
const attesa = async (id: string) => (await prisma.invioProgrammato.findMany({ where: { leadId: id, stato: "IN_ATTESA" } })).map((i) => `${i.percorso}#${i.passo}@${perInput(i.eseguiDopo)}`);
const email = async (id: string, chiave: string) => prisma.emailLead.findMany({ where: { leadId: id, chiave }, orderBy: { createdAt: "asc" } });

async function main() {
  await new Promise<void>((r) => smtp.listen(2529, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2529", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","InvioProgrammato","EmailLead","Appuntamento","Lead","Cliente","Configurazione","Utente","Brand" CASCADE');
  await prisma.brand.create({ data: { nome: "P&C" } });
  await prisma.utente.create({ data: { nome: "Alessia Vaccaro", email: "a@x.it", username: "alessiav", ruolo: "TELEFONISTA" } });
  await imposta(CHIAVE_ATTIVE, "1");

  console.log("1. Non interessato: recupero programmato dopo 3 mesi");
  const r1 = await registraLead({ nome: "Anna Bianchi", telefono: "3401", email: "anna@b.it", fonte: "facebook" });
  const a = r1!.id;
  await prisma.invioProgrammato.updateMany({ where: { leadId: a }, data: { stato: "ANNULLATO" } });
  await registraEsito({ leadId: a, esito: "IN_TARGET" }, ora());
  await prisma.invioProgrammato.updateMany({ where: { leadId: a, stato: "IN_ATTESA" }, data: { stato: "ANNULLATO" } });
  await registraEsito({ leadId: a, esito: "NON_INTERESSATO" }, ora());
  await esegui();
  verifica((await email(a, "interest-closed"))[0]?.stato === "INVIATA" && (await attesa(a)).join() === "NON_INTERESSATO#1@2027-02-02T10:00", "E-13 inviata, recupero il 2/2/2027 alle 10:00", await attesa(a));

  console.log("2. Senza una promozione valida il recupero aspetta");
  await prossimo(a);
  const l2 = await lead(a);
  verifica(l2.fase === "NON_INTERESSATO" && (await email(a, "lost-recovery-promotion")).length === 0 && (await attesa(a)).join() === "NON_INTERESSATO#1@2027-02-10T08:00", "nessuna email, riprova dopo almeno 7 giorni (mercoledì 08:00)", await attesa(a));
  verifica((await prisma.leadEvento.count({ where: { leadId: a, tipo: "recupero.in_attesa" } })) === 1, "segnalato nello storico");

  console.log("3. Con la promozione: email al cliente e di nuovo in coda come Da recuperare");
  await imposta(CHIAVE_PROMO_TESTO, "• Sconto in fattura sulle pergole\n• Finanziamento su misura");
  await imposta(CHIAVE_PROMO_FINO, "2027-03-31");
  await prossimo(a);
  const l3 = await lead(a);
  const promo = (await email(a, "lost-recovery-promotion"))[0];
  verifica(promo?.stato === "INVIATA" && promo.testo.includes("• Sconto in fattura sulle pergole") && promo.testo.includes("31 marzo 2027"), "promozione inviata con il testo di Impostazioni", promo);
  verifica(l3.fase === "RECUPERO" && l3.recuperi === 1 && l3.recuperoIl !== null && perInput(l3.scadenzaAzione!) === "2027-02-15T18:30", "lead Da recuperare, da chiamare entro il primo giorno utile dopo 3 giorni (lunedì)", l3);
  verifica((await attesa(a)).join() === "RECUPERO#0@2027-02-15T08:00", "primo sollecito al centralino lunedì 08:00", await attesa(a));
  await prossimo(a);
  const s1 = (await email(a, "lost-recovery-call-requested"))[0];
  verifica(s1?.a === "promozione@gruppopec.com".replace("zione", "zionale") && s1.testo.includes("5 giorni fa gli abbiamo inviato la promozione") && s1.testo.includes("Sconto in fattura"), "\"Recupera il contatto\" al centralino con la promozione inviata", s1?.testo);

  console.log("4. Solleciti finiti → secondo recupero; poi basta (massimo 2)");
  for (let k = 0; k < 3; k++) await prossimo(a); // #2, #3, timeout → programma il recupero
  verifica((await lead(a)).nonGestitoIl !== null && (await attesa(a))[0] === "RECUPERO#4@2027-06-14T10:00", "non gestito a metà marzo, recupero n.2 3 mesi dopo (14 giugno 10:00)", await attesa(a));
  await imposta(CHIAVE_PROMO_FINO, "2027-12-31");
  await prossimo(a);
  verifica((await lead(a)).recuperi === 2 && (await email(a, "lost-recovery-promotion")).length === 2, "secondo recupero fatto");
  for (let k = 0; k < 6; k++) await prossimo(a);
  const finale = await prisma.invioProgrammato.findFirstOrThrow({ where: { leadId: a }, orderBy: [{ createdAt: "desc" }, { passo: "desc" }] });
  verifica(finale.stato === "SALTATO" && finale.errore === "già recuperato 2 volte" && (await attesa(a)).length === 0, "terzo recupero non fatto", finale);

  console.log("5. Un esito durante il recupero ferma i solleciti; mesi configurabili; disiscritti");
  await imposta(CHIAVE_MESI_RECUPERO, "1");
  orologio = daOraRoma("2027-03-01T10:00")!;
  const b = (await registraLead({ nome: "Bruno Neri", telefono: "3402", email: "b@n.it", fonte: "web" }))!.id;
  await prisma.invioProgrammato.updateMany({ where: { leadId: b }, data: { stato: "ANNULLATO" } });
  await registraEsito({ leadId: b, esito: "IN_TARGET" }, ora());
  await prisma.invioProgrammato.updateMany({ where: { leadId: b, stato: "IN_ATTESA" }, data: { stato: "ANNULLATO" } });
  await registraEsito({ leadId: b, esito: "NON_INTERESSATO" }, ora());
  await esegui();
  verifica((await attesa(b)).join() === "NON_INTERESSATO#1@2027-04-01T10:00", "con 1 mese: recupero il 1/4", await attesa(b));
  await prisma.lead.update({ where: { id: b }, data: { disiscritto: true } });
  await prossimo(b);
  verifica((await email(b, "lost-recovery-promotion"))[0]?.stato === "SOPPRESSA" && (await lead(b)).fase === "RECUPERO", "disiscritto: niente email ma torna comunque in coda");
  const rr = await registraEsito({ leadId: b, esito: "DA_RICHIAMARE", data: daOraRoma("2027-04-10T11:00")! }, ora());
  verifica(rr.ok && (await attesa(b)).every((x) => x.startsWith("DA_RICHIAMARE")), "esito registrato: i solleciti del recupero sono annullati", await attesa(b));

  smtp.close();
  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
