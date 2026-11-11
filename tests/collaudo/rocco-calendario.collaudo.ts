// Collaudo: richieste di Rocco su lead e calendario (PDF «modifiche PC per lead e calendario»): «Appuntamento annullato» → task
// «Motiva l'annullamento» (richiamare con o senza email al cliente, oppure non interessato), riunioni interne con invito ai
// partecipanti (server SMTP finto), ricerca che perdona gli errori.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/rocco-calendario.collaudo.ts
import net from "node:net";

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
import { registraEsito } from "../../src/lib/automazioni/motore";
import { esitiPossibili, FASI_LEAD } from "../../src/lib/automazioni/percorsi";
import { rifissaDalCentralino, creaRiunione, annullaRiunione } from "../../src/app/calendario-actions";
import { eventiPeriodo } from "../../src/lib/calendario/server";
import { clientiSimili, leadSimili } from "../../src/lib/ricerca/server";
import { perInput } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };

async function main() {
  await new Promise<void>((r) => smtp.listen(2535, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2535", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "Riunione","LeadEvento","EmailLead","InvioProgrammato","Appuntamento","Lead","Cliente","Configurazione","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const cri = await prisma.utente.create({ data: { nome: "Cristina Rege", email: "c@x.it", username: "cri", ruolo: "TELEFONISTA" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "m@x.it", username: "marco", ruolo: "COMMERCIALE" } });
  g.__utente = marco;
  const domani = new Date(Date.now() + 2 * 86400_000);

  console.log("1. «Appuntamento annullato» dal calendario → task «Motiva l'annullamento»");
  const lead = await prisma.lead.create({ data: { nome: "Giovanni Izzo", telefono: "3331234567", email: "gi@x.it", brandId: b.id, telefonistaId: cri.id, fase: "IN_TARGET", comune: "Torino" } });
  await registraEsito({ leadId: lead.id, esito: "APPUNTAMENTO_CASA", data: domani, venditoreId: marco.id, indirizzo: "Via Roma 1, Torino", utenteNome: "Cristina Rege" });
  verifica(!esitiPossibili("APPUNTAMENTO_CASA").includes("NON_INTERESSATO"), "con l'appuntamento fissato non c'è più «non interessato» (si passa dall'annullamento)");
  const app = (await prisma.appuntamento.findFirst({ where: { utenteId: marco.id } }))!;
  const prima = Date.now();
  const d = await dove(rifissaDalCentralino(fd({ id: app.id, annullato: "1" })));
  const l1 = (await prisma.lead.findUnique({ where: { id: lead.id } }))!;
  verifica(d?.includes("Motiva l'annullamento"), "messaggio: il centralino trova il task", d);
  verifica(l1.fase === "APPUNTAMENTO_ANNULLATO" && FASI_LEAD[l1.fase].azione === "Motiva l'annullamento" && l1.scadenzaAzione!.getTime() >= prima - 1000 && l1.scadenzaAzione!.getTime() <= Date.now() + 1000, "lead in «Motiva l'annullamento» con scadenza adesso (task di oggi)", l1);
  verifica((await prisma.appuntamento.findUnique({ where: { id: app.id } }))?.stato === "ANNULLATO", "l'evento sparisce dal calendario (annullato)");
  verifica(JSON.stringify(esitiPossibili("APPUNTAMENTO_ANNULLATO").slice(0, 2)) === '["DA_RICHIAMARE","NON_INTERESSATO"]', "le due strade: richiamare più avanti o non interessato");

  console.log("2. Richiamare più avanti SENZA promemoria al cliente");
  const fra3 = new Date(Date.now() + 3 * 86400_000);
  const r = await registraEsito({ leadId: lead.id, esito: "DA_RICHIAMARE", data: fra3, utenteNome: "Cristina Rege", senzaEmailCliente: true });
  verifica(r.ok, "esito registrato", r);
  const invii = await prisma.invioProgrammato.findMany({ where: { leadId: lead.id, percorso: "DA_RICHIAMARE" }, orderBy: { passo: "asc" } });
  verifica(invii[0]?.stato === "SALTATO" && invii[0].errore?.includes("niente email al cliente"), "l'email «ti ricontatteremo» al cliente è saltata", invii[0]);
  verifica(invii.some((i) => i.passo === 1 && i.stato === "IN_ATTESA"), "resta il promemoria al centralino il giorno scelto");
  const ev = await prisma.leadEvento.findFirst({ where: { leadId: lead.id, tipo: "lead.esito" }, orderBy: { createdAt: "desc" } });
  verifica(ev?.testo.includes("nessuna email al cliente"), "nella cronologia si vede che non è partita l'email", ev?.testo);
  // con l'email (comportamento di sempre)
  const lead2 = await prisma.lead.create({ data: { nome: "Anna Neri", telefono: "3330000000", email: "an@x.it", brandId: b.id, telefonistaId: cri.id, fase: "APPUNTAMENTO_ANNULLATO" } });
  await registraEsito({ leadId: lead2.id, esito: "DA_RICHIAMARE", data: fra3, utenteNome: "Cristina Rege" });
  verifica((await prisma.invioProgrammato.findFirst({ where: { leadId: lead2.id, passo: 0 } }))?.stato === "IN_ATTESA", "senza spunta l'email al cliente parte come sempre");
  const lead3 = await prisma.lead.create({ data: { nome: "Paolo Bassi", brandId: b.id, telefonistaId: cri.id, fase: "APPUNTAMENTO_ANNULLATO" } });
  verifica((await registraEsito({ leadId: lead3.id, esito: "NON_INTERESSATO", utenteNome: "Cristina Rege" })).ok, "oppure si chiude come non interessato");

  console.log("3. Riunione interna con il team");
  posta.length = 0;
  const quando = perInput(new Date(Date.now() + 86400_000)).slice(0, 10) + "T09:00";
  let x = await dove(creaRiunione(fd({ titolo: "Riunione commerciale", dataOra: quando, durataMin: "60", partecipanti: [marco.id, ugo.id], luogo: "Sala Rosta" })));
  const riu = (await prisma.riunione.findFirst())!;
  verifica(riu && riu.partecipanti.length === 2 && x?.includes("Invito mandato a 2"), "riunione salvata e invito a tutti e due", x);
  verifica(posta.length === 2 && posta.every((p) => /Riunione commerciale/.test(p.dati) && /text\/calendar/i.test(p.dati)), "due email con l'invito di calendario", posta.map((p) => p.a));
  const evM = await eventiPeriodo({ da: new Date(), a: new Date(Date.now() + 3 * 86400_000), utenteId: marco.id });
  const evT = await eventiPeriodo({ da: new Date(), a: new Date(Date.now() + 3 * 86400_000) });
  verifica(evM.some((e) => e.tipo === "RIUNIONE" && e.note?.includes("Ugo Perottino")), "nel calendario di Marco, con chi partecipa");
  verifica(evT.filter((e) => e.tipo === "RIUNIONE").length === 2, "nel calendario del team compare una volta per persona (colore di ognuno)");
  verifica((await eventiPeriodo({ da: new Date(), a: new Date(Date.now() + 3 * 86400_000), utenteId: cri.id })).every((e) => e.tipo !== "RIUNIONE"), "non nel calendario di chi non partecipa");
  x = await dove(creaRiunione(fd({ titolo: "Senza nessuno", dataOra: quando })));
  verifica(x?.includes("almeno una persona"), "senza partecipanti non si salva", x);
  posta.length = 0;
  await dove(annullaRiunione(fd({ id: riu.id })));
  verifica((await prisma.riunione.findUnique({ where: { id: riu.id } }))?.stato === "ANNULLATO" && posta.length === 2 && posta.every((p) => /ANNULLATA/.test(p.dati)), "annullata: avviso a tutti");

  console.log("4. Ricerca che perdona gli errori");
  await prisma.cliente.createMany({ data: [{ nome: "Rossi Mario", brandId: b.id }, { nome: "Bianchi Laura", brandId: b.id }] });
  const sim = await clientiSimili("Rosi Mraio", {}, []);
  const nomi = await prisma.cliente.findMany({ where: { id: { in: sim } }, select: { nome: true } });
  verifica(nomi.length === 1 && nomi[0].nome === "Rossi Mario", "«Rosi Mraio» trova «Rossi Mario»", nomi);
  const simL = await leadSimili("Giovani Izzo", {}, []);
  verifica(simL[0] === lead.id, "anche fra i lead («Giovani Izzo» → Giovanni Izzo)", simL);

  console.log(`\n${ok} ok, ${ko} ko`);
  smtp.close();
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
