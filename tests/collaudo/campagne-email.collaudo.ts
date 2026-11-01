// Collaudo: campagne email (filtri, invio a blocchi, disiscrizione, avvisi di scadenza 3-2-1).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/campagne-email.collaudo.ts
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
import { accodaCampagna, eseguiCampagne, inviaProva, contaDestinatari, filtriDi, firmaCliente, disiscriviCliente, CHIAVE_PROMEMORIA_GIORNI, CHIAVE_PROMEMORIA_A } from "../../src/lib/campagne/motore";
import { daOraRoma } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
let orologio = daOraRoma("2026-11-02T10:00")!;
const esegui = (max?: number) => eseguiCampagne({ adesso: () => orologio, max });
const imposta = (chiave: string, valore: string) => prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });
/** oggetto dell'email (anche codificato MIME) */
const oggetto = (dati: string) => {
  const m = dati.match(/^Subject: (.*(?:\r\n[ \t].*)*)/m)?.[1] ?? "";
  return m.replace(/\r\n[ \t]/g, " ").replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=\s*/gi, (_, t, s) =>
    t.toUpperCase() === "B" ? Buffer.from(s, "base64").toString("utf8") : Buffer.from(s.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_x: string, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8"));
};
const corpo = (dati: string) => dati.replace(/=\r\n/g, "").replace(/=3D/g, "=");

async function main() {
  await new Promise<void>((r) => smtp.listen(2531, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2531", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "CampagnaInvio","Campagna","Lead","Cliente","Configurazione","Utente","Brand" CASCADE');
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  const sol = await prisma.brand.create({ data: { nome: "Solaris" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const cl = (nome: string, brandId: string, extra: Record<string, unknown> = {}) => prisma.cliente.create({ data: { nome, brandId, ...extra } });
  const anna = await cl("BIANCHI ANNA", sol.id, { email: "anna@b.it", statoLead: "COMPRATO", categoria: "Account, Cliente", nomePersona: "anna", responsabileId: ugo.id, provincia: "TO" });
  const bruno = await cl("Verdi Bruno", sol.id, { email: "BRUNO@v.it ", statoLead: "Non interessato", origine: "FACEBOOK", provincia: "TO" });
  await cl("Neri Carla", sol.id, { statoLead: "COMPRATO" }); // senza email
  await cl("Gialli Dario", sol.id, { email: "dario@g.it", statoLead: "COMPRATO", disiscritto: true });
  const elena = await cl("Rosa Elena", sol.id, { email: "elena@r.it" }); // senza stato
  await cl("Blu Franco", pc.id, { email: "franco@b.it", statoLead: "COMPRATO" }); // altro marchio

  console.log("1. Filtri e conteggio");
  const c = await prisma.campagna.create({ data: { nome: "Pompe di calore inverno", oggetto: "{nome}, la pompa di calore con lo sconto", testo: "Ciao {nome},\n\nofferta valida fino a fine mese.\n\nGruppo P&C", marchi: ["Solaris"], stati: ["COMPRATO", "Non interessato", "(nessuno)"], validaFino: daOraRoma("2026-11-10T12:00") } });
  const conti = await contaDestinatari(filtriDi(c));
  verifica(conti.totale === 5 && conti.raggiungibili === 3 && conti.disiscritti === 1 && conti.senzaEmail === 1, "5 nei filtri: 3 raggiungibili, 1 disiscritto, 1 senza email", conti);
  const soloClienti = await contaDestinatari({ ...filtriDi(c), categorie: ["Cliente"] });
  verifica(soloClienti.totale === 1, "filtro 'Cliente' (ha comprato) → solo Anna", soloClienti);
  const fb = await contaDestinatari({ ...filtriDi(c), provenienza: "FACEBOOK" });
  verifica(fb.totale === 1, "filtro provenienza Facebook → solo Bruno", fb);
  const com = await contaDestinatari({ marchi: [], stati: [], categorie: [], commercialeId: ugo.id, provincia: "to" });
  verifica(com.totale === 1, "filtro commerciale + provincia", com);

  console.log("2. Senza posta configurata non parte nulla (e non dà errori)");
  const smtpHost = process.env.SMTP_HOST; delete process.env.SMTP_HOST;
  const r0 = await esegui();
  verifica(r0.motivo && r0.inviate === 0, "motivo: posta non configurata", r0);
  process.env.SMTP_HOST = smtpHost;

  console.log("3. Prova");
  posta.length = 0;
  const p = await inviaProva(c.id, "rocco@gruppopec.com");
  verifica(p.inviata && posta.length === 1 && posta[0].a[0] === "rocco@gruppopec.com", "email di prova solo al marketing", p);
  verifica(oggetto(posta[0].dati).startsWith("[PROVA] Mario Rossi, la pompa"), "oggetto di prova con nome di esempio", oggetto(posta[0].dati));
  verifica(await prisma.campagnaInvio.count() === 0, "la prova non mette nessuno in coda");

  console.log("4. Invio a blocchi, senza doppioni");
  posta.length = 0;
  const n = await accodaCampagna(c.id, orologio);
  verifica(n === 3, "3 in coda", n);
  verifica((await prisma.campagna.findUniqueOrThrow({ where: { id: c.id } })).stato === "IN_INVIO", "campagna in invio");
  const r1 = await esegui(2);
  verifica(r1.inviate === 2 && posta.length === 2, "primo blocco: 2 email", r1);
  const r2 = await esegui(2);
  verifica(r2.inviate === 1 && posta.length === 3, "secondo blocco: l'ultima", r2);
  const dest = posta.map((m) => m.a[0]).sort();
  verifica(JSON.stringify(dest) === JSON.stringify(["anna@b.it", "bruno@v.it", "elena@r.it"]), "destinatari giusti (email ripulita)", dest);
  const mAnna = posta.find((m) => m.a[0] === "anna@b.it")!;
  verifica(oggetto(mAnna.dati) === "Anna, la pompa di calore con lo sconto", "oggetto con il nome proprio", oggetto(mAnna.dati));
  verifica(corpo(mAnna.dati).includes(`/api/disiscrizione?c=${anna.id}&t=${firmaCliente(anna.id)}`), "link per disiscriversi firmato");
  verifica(/From: .*promozionale@gruppopec\.com/i.test(mAnna.dati), "mittente promozionale@");
  verifica((await prisma.campagna.findUniqueOrThrow({ where: { id: c.id } })).stato === "INVIATA", "campagna segnata come inviata");
  verifica(await accodaCampagna(c.id, orologio) === 0, "rinvio: chi l'ha già ricevuta non la riceve due volte");
  await esegui();
  verifica(posta.length === 3, "nessuna email in più");

  console.log("5. Disiscrizione dal link");
  verifica(!(await disiscriviCliente(bruno.id, "firma-sbagliata")), "firma sbagliata rifiutata");
  verifica(await disiscriviCliente(bruno.id, firmaCliente(bruno.id)), "firma giusta accettata");
  verifica((await prisma.cliente.findUniqueOrThrow({ where: { id: bruno.id } })).disiscritto, "Bruno disiscritto");
  const c2 = await prisma.campagna.create({ data: { nome: "Seconda", oggetto: "Novità", testo: "Ciao {nome}", marchi: ["Solaris"] } });
  posta.length = 0;
  await accodaCampagna(c2.id, orologio);
  // Elena si disiscrive dopo essere entrata in coda: l'email viene soppressa
  await disiscriviCliente(elena.id, firmaCliente(elena.id));
  const r3 = await esegui();
  verifica(r3.inviate === 1 && r3.saltate === 1 && posta.length === 1 && posta[0].a[0] === "anna@b.it", "solo Anna: Bruno escluso, Elena soppressa", { r3, a: posta.map((m) => m.a) });

  console.log("6. Avvisi di scadenza 3-2-1 giorni prima, una volta sola");
  await imposta(CHIAVE_PROMEMORIA_A, "rocco@gruppopec.com, ugo@gruppopec.com");
  posta.length = 0;
  const avvisi = () => posta.filter((m) => oggetto(m.dati).includes("scade")).map((m) => oggetto(m.dati));
  orologio = daOraRoma("2026-11-06T09:00")!; await esegui();
  verifica(avvisi().length === 0, "4 giorni prima: niente");
  orologio = daOraRoma("2026-11-07T07:05")!; await esegui(); await esegui();
  verifica(avvisi().length === 1 && avvisi()[0].includes("fra 3 giorni"), "3 giorni prima: un avviso (anche se il controllo gira due volte)", avvisi());
  verifica(posta.at(-1)!.a.length === 2 && /From: .*marketing@gruppopec\.com/i.test(posta.at(-1)!.dati), "a tutti i destinatari impostati, da marketing@");
  verifica(corpo(posta.at(-1)!.dati).includes(`/campagne/${c.id}`), "con il link alla campagna");
  orologio = daOraRoma("2026-11-08T07:05")!; await esegui();
  orologio = daOraRoma("2026-11-09T07:05")!; await esegui();
  verifica(avvisi().length === 3 && avvisi()[2].includes("domani"), "2 giorni prima e 1 giorno prima (domani)", avvisi());
  orologio = daOraRoma("2026-11-10T07:05")!; await esegui();
  verifica(avvisi().length === 3, "il giorno della scadenza non c'è avviso (non è tra i giorni scelti)");
  const bozza = await prisma.campagna.create({ data: { nome: "Bozza", validaFino: daOraRoma("2026-11-11T12:00") } });
  await esegui();
  verifica(avvisi().length === 3, "le bozze non mandano avvisi", bozza.id);

  console.log("7. Giorni modificabili in Impostazioni + nuova scadenza");
  await imposta(CHIAVE_PROMEMORIA_GIORNI, "5,0");
  await prisma.campagna.update({ where: { id: c.id }, data: { validaFino: daOraRoma("2026-11-15T12:00"), promemoriaInviati: [] } });
  await esegui();
  verifica(avvisi().length === 4 && avvisi()[3].includes("fra 5 giorni"), "nuova scadenza: avviso 5 giorni prima", avvisi());
  orologio = daOraRoma("2026-11-15T07:05")!; await esegui();
  verifica(avvisi().length === 5 && avvisi()[4].includes("scade oggi"), "e il giorno stesso", avvisi());

  console.log("8. Promozione del recupero lead: stesso avviso");
  await imposta(CHIAVE_PROMEMORIA_GIORNI, "3,2,1");
  await imposta("recupero_promo_fino", "2026-11-20");
  orologio = daOraRoma("2026-11-17T07:05")!; await esegui(); await esegui();
  const rec = avvisi().filter((o) => o.includes("recupero"));
  verifica(rec.length === 1 && rec[0].includes("fra 3 giorni"), "avviso promozione recupero 3 giorni prima, una volta", rec);
  orologio = daOraRoma("2026-11-19T07:05")!; await esegui();
  verifica(avvisi().filter((o) => o.includes("recupero")).length === 2, "e il giorno prima");

  smtp.close();
  await prisma.$disconnect();
  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
