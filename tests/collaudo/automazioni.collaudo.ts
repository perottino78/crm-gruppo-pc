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
import { registraLead } from "../../src/lib/leadIngest";
import { registraEsito, eseguiInviiScaduti, linkDisiscrizione, CHIAVE_ATTIVE } from "../../src/lib/automazioni/motore";
import { esitoLead } from "../../src/app/lead-percorso-actions";
import { GET as disiscrizione } from "../../src/app/api/disiscrizione/route";
import { daOraRoma, perInput } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d); } };
let orologio = daOraRoma("2026-11-03T10:00")!; // martedì
const ora = () => orologio;
const vai = (s: string) => { orologio = daOraRoma(s)!; };
const esegui = async (forza = false) => { const r = await eseguiInviiScaduti({ adesso: ora, forza }); await aggiornaOggetti(); return r; };
let oggettiInviati: string[] = [];
const oggetti = () => oggettiInviati;
const aggiornaOggetti = async () => { oggettiInviati = (await prisma.emailLead.findMany({ where: { stato: "INVIATA" }, orderBy: [{ inviataIl: "asc" }, { createdAt: "asc" }] })).map((e) => e.oggetto); };
const prossimi = async (leadId: string) => (await prisma.invioProgrammato.findMany({ where: { leadId, stato: "IN_ATTESA" } })).map((i) => `${i.percorso}#${i.passo}@${perInput(i.eseguiDopo)}`);

async function main() {
  await new Promise<void>((r) => smtp.listen(2527, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2527", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","InvioProgrammato","EmailLead","Lead","Configurazione","Utente","Brand" CASCADE');
  await prisma.brand.create({ data: { nome: "P&C" } });
  const alessia = await prisma.utente.create({ data: { nome: "Alessia Vaccaro", email: "a@x.it", username: "alessiav", ruolo: "TELEFONISTA" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco", email: "m@x.it", username: "m", ruolo: "COMMERCIALE" } });

  console.log("1. Nuovo lead con le email in pausa (Keap ancora attivo)");
  const r1 = await registraLead({ nome: "Mario Rossi", telefono: "333 1234567", email: "mario@rossi.it", fonte: "facebook", comune: "Rivoli", prodotto: "Pergola" });
  const id = r1!.id;
  // registraLead usa l'ora vera: riallineo le date del lead e del primo invio all'orologio simulato
  await prisma.invioProgrammato.updateMany({ where: { leadId: id }, data: { eseguiDopo: ora() } });
  const l1 = await prisma.lead.findUniqueOrThrow({ where: { id } });
  verifica(l1.fase === "NUOVO" && l1.telefonistaId === alessia.id && l1.comune === "Rivoli" && l1.prodotto === "Pergola", "lead da classificare, assegnato alla telefonista", l1);
  verifica((await esegui()).motivo === "email automatiche in pausa" && posta.length === 0, "in pausa: nessuna email");

  console.log("2. Accese: avviso al centralino");
  await prisma.configurazione.create({ data: { chiave: CHIAVE_ATTIVE, valore: "1" } });
  const e1 = await esegui();
  verifica(e1.email === 1 && posta[0]?.a[0] === "promozionale@gruppopec.com" && oggetti()[0].includes("da classificare") && posta[0].dati.includes("marketing@gruppopec.com"), "E-01 al centralino da Rocco", { e1, o: oggetti() });

  console.log("3. In target: grazie al cliente + chiamata #1, poi #2 e #3 nei giorni dopo alle 08:00");
  verifica((await registraEsito({ leadId: id, esito: "NON_RISPONDE" }, ora())).ok === false, "da classificare non si può dire 'non risponde'");
  await registraEsito({ leadId: id, esito: "IN_TARGET", utenteNome: "Alessia" }, ora());
  await esegui();
  verifica(posta.length === 3 && posta[1].a[0] === "mario@rossi.it" && oggetti()[1] === "GRUPPO P&C: Grazie per la tua richiesta!" && posta[1].dati.includes("promozionale@gruppopec.com") && oggetti()[2].includes("Contatto in target da chiamare"), "cliente ringraziato e centralino avvisato", oggetti());
  verifica(posta[1].dati.includes("disiscrizione"), "email al cliente con il link per disiscriversi");
  const p3 = await prossimi(id);
  verifica(p3.length === 1 && p3[0] === "IN_TARGET#2@2026-11-05T08:00", "sollecito #2: almeno un giorno dopo, alle 08:00 (giovedì)", p3);
  vai("2026-11-05T08:01"); await esegui();
  verifica(posta.length === 4 && (await prossimi(id))[0] === "IN_TARGET#3@2026-11-07T08:00", "#2 inviato giovedì 08:01, #3 almeno 24 ore dopo: sabato 08:00", await prossimi(id));

  console.log("4. Non risponde: annulla il vecchio ciclo, avvisa il cliente, solleciti al centralino");
  await registraEsito({ leadId: id, esito: "NON_RISPONDE", utenteNome: "Alessia" }, ora());
  verifica((await prisma.invioProgrammato.count({ where: { leadId: id, percorso: "IN_TARGET", stato: "ANNULLATO" } })) === 1, "il #3 di In target è annullato");
  const l4 = await prisma.lead.findUniqueOrThrow({ where: { id } });
  verifica(perInput(l4.scadenzaAzione!) === "2026-11-07T18:30", "nuovo tentativo entro sabato 18:30 (primo giorno utile dopo 24 ore)", perInput(l4.scadenzaAzione!));
  await esegui();
  verifica(oggetti().at(-1) === "GRUPPO P&C: Abbiamo provato a chiamarti" && (await prossimi(id))[0] === "NON_RISPONDE#1@2026-11-07T08:00", "E-11 al cliente, sollecito #1 sabato 08:00", await prossimi(id));

  console.log("5. Esito dalla pagina: controllo permessi e data obbligatoria");
  g.__utente = marco;
  verifica((await redirectA(esitoLead(fd({ leadId: id, esito: "NON_INTERESSATO" }))))?.includes("errore=Lead"), "un commerciale non vede il lead della telefonista");
  g.__utente = alessia;
  verifica((await redirectA(esitoLead(fd({ leadId: id, esito: "DA_RICHIAMARE" }))))?.replace(/\+/g, " ").includes("Indica data e ora del ricontatto"), "il ricontatto vuole la data");

  console.log("6. Il cliente si disiscrive: le email al cliente si fermano, quelle interne no");
  const res = await disiscrizione(new NextRequest(linkDisiscrizione(id).replace(/^https?:\/\/[^/]+/, "http://localhost")));
  verifica(res.status === 200 && (await prisma.lead.findUniqueOrThrow({ where: { id } })).disiscritto, "disiscritto dal link");
  verifica((await disiscrizione(new NextRequest(`http://localhost/api/disiscrizione?l=${id}&t=falsa`))).status === 400, "link falsificato rifiutato");
  const R = daOraRoma("2026-11-10T15:30")!;
  await registraEsito({ leadId: id, esito: "DA_RICHIAMARE", data: R, utenteNome: "Alessia" }, ora());
  await esegui();
  const reg = await prisma.emailLead.findFirstOrThrow({ where: { leadId: id, chiave: "callback-confirmed" } });
  verifica(reg.stato === "SOPPRESSA" && reg.motivo === "il cliente si è disiscritto", "conferma del ricontatto non inviata (disiscritto)");
  verifica((await prossimi(id))[0] === "DA_RICHIAMARE#1@2026-11-10T15:30", "chiamata al centralino il giorno R alle 15:30", await prossimi(id));
  vai("2026-11-10T15:31"); const n6 = posta.length; await esegui();
  verifica(posta.length === n6 + 1 && oggetti().at(-1)!.includes("Richiama il contatto interessato") && (await prossimi(id))[0] === "DA_RICHIAMARE#2@2026-11-11T15:30", "R inviata, R+1 programmata", await prossimi(id));

  console.log("7. Ritardo oltre 24 ore: niente invio automatico");
  vai("2026-11-13T09:00"); const n7 = posta.length; await esegui();
  const j7 = await prisma.invioProgrammato.findFirstOrThrow({ where: { leadId: id, passo: 2, percorso: "DA_RICHIAMARE" } });
  verifica(posta.length === n7 && j7.stato === "DA_VERIFICARE" && (await prossimi(id)).length === 0, "R+1 in ritardo: da verificare, la catena si ferma", j7);

  console.log("8. Timeout: solleciti finiti senza esito → non gestito");
  vai("2026-11-16T10:00");
  const r8 = await registraLead({ nome: "Luca Bianchi", telefono: "3401112222", email: "luca@b.it", fonte: "instagram" });
  await prisma.invioProgrammato.updateMany({ where: { leadId: r8!.id }, data: { eseguiDopo: ora() } });
  await registraEsito({ leadId: r8!.id, esito: "IN_TARGET" }, ora());
  await esegui();
  // si va avanti fino a ogni scadenza programmata, come farebbe il controllo periodico
  for (let k = 0; k < 10; k++) {
    const j = await prisma.invioProgrammato.findFirst({ where: { leadId: r8!.id, stato: "IN_ATTESA" }, orderBy: { eseguiDopo: "asc" } });
    if (!j) break;
    orologio = new Date(j.eseguiDopo.getTime() + 60_000);
    await esegui();
  }
  const l8 = await prisma.lead.findUniqueOrThrow({ where: { id: r8!.id } });
  verifica(l8.nonGestitoIl !== null && (await prossimi(r8!.id)).every((x) => x.startsWith("IN_TARGET#5@")), "dopo #3 e 20 giorni il lead risulta non gestito (resta solo il recupero fra qualche mese)", await prossimi(r8!.id));

  console.log("9. Posta irraggiungibile: tre tentativi e poi stop, senza doppioni");
  const r9 = await registraLead({ nome: "Anna Neri", telefono: "3405556666", email: "anna@n.it", fonte: "web" });
  await prisma.invioProgrammato.updateMany({ where: { leadId: r9!.id }, data: { eseguiDopo: ora() } });
  await new Promise<void>((r) => smtp.close(() => r()));
  const base9 = orologio.getTime();
  for (const s of [0, 1, 6]) { orologio = new Date(base9 + s * 60_000 + 1000); await esegui(); }
  const j9 = await prisma.invioProgrammato.findFirstOrThrow({ where: { leadId: r9!.id } });
  verifica(j9.stato === "FALLITO" && j9.tentativi === 3, "dopo 3 tentativi: non riuscito", j9);
  await new Promise<void>((r) => smtp.listen(2527, r));

  console.log("10. Due controlli insieme non mandano la stessa email due volte");
  orologio = new Date(orologio.getTime() + 3600_000);
  const r10 = await registraLead({ nome: "Paola Verdi", telefono: "3407778888", email: "paola@v.it", fonte: "fiera" });
  await prisma.invioProgrammato.updateMany({ where: { leadId: r10!.id }, data: { eseguiDopo: ora() } });
  await registraEsito({ leadId: r10!.id, esito: "FUORI_REGIONE" }, ora());
  const n10 = posta.length;
  await Promise.all([esegui(), esegui(), esegui()]);
  verifica(posta.length === n10 + 1 && oggetti().at(-1) === "GRUPPO P&C: Ci spiace ma non serviamo ancora la tua regione", "una sola email (Fuori regione); l'avviso di classificazione è stato annullato", oggetti().slice(n10));
  verifica((await prisma.leadEvento.count({ where: { leadId: id } })) >= 6, "storico del lead completo");

  smtp.close();
  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
