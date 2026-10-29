// Collaudo magazzino, bolle e fatture d'acquisto su database di PROVA.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/magazzino.collaudo.ts
import { readFileSync } from "node:fs";
import { prisma } from "../../src/lib/prisma";
import * as M from "../../src/app/magazzino-actions";
import * as F from "../../src/app/fatture-actions";
import { giacenze } from "../../src/lib/magazzino/server";
import { correlatiCliente } from "../../src/lib/documenti/correlati";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | File | (string | File)[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x)); return f; };
const senzaRedirect = async (p: Promise<unknown>) => { try { await p; } catch (e) { if (!String((e as Error).message ?? e).includes("NEXT_REDIRECT") && !(e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e; } };
const lancia = async (p: Promise<unknown>) => { try { await p; return false; } catch { return true; } };
const XML = readFileSync(new URL("./fattura-prova.xml", import.meta.url), "utf8");

async function nuovaBolla(extra: Record<string, string> = {}) {
  await senzaRedirect(M.creaBolla(fd({ fornitoreId: somfy.id, ...extra })));
  return prisma.bollaEntrata.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
}
let somfy: { id: string };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaFatturaAcquisto","FatturaAcquisto","MovimentoMagazzino","RigaBolla","BollaEntrata","TaskPratica","CostoManuale","Documento","OrdineFornitore","RigaOrdine","CommessaEvento","Commessa","Preventivo","Articolo","Cliente","Soggetto","Utente","Brand" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const admin = await prisma.utente.create({ data: { nome: "Laura", email: "laura@prova.it", ruolo: "AMMINISTRATIVO" } });
  const comm = await prisma.utente.create({ data: { nome: "Mario", email: "mario@prova.it", ruolo: "COMMERCIALE" } });
  somfy = await prisma.soggetto.create({ data: { ragioneSociale: "SOMFY ITALIA S.R.L.", partitaIva: "IT01234567890", ruoli: ["FORNITORE"], giorniPagamento: 60 } });
  const art = await prisma.articolo.create({ data: { codice: "VITI-6X60", descrizione: "Viti 6x60 inox", um: "conf", fornitoreId: somfy.id } });
  const cli = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", brandId: brand.id, comune: "Torino" } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: comm.id, oggetto: "Tapparelle" } });
  const c = await prisma.commessa.create({ data: { numero: 7, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: brand.id } });
  const prev2 = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: comm.id, oggetto: "Viti" } });
  const c2 = await prisma.commessa.create({ data: { numero: 8, anno: 2026, preventivoId: prev2.id, clienteId: cli.id, brandId: brand.id } });
  const ord = await prisma.ordineFornitore.create({ data: { numero: 7, anno: 2026, fornitoreId: somfy.id, stato: "INVIATO", inviatoIl: new Date() } });
  const rA = await prisma.rigaOrdine.create({ data: { commessaId: c.id, ordineFornitoreId: ord.id, fornitoreId: somfy.id, descrizione: "Motore Oximo 40", codiceFornitore: "SOM 1870", quantita: 2, um: "pz", prezzoAcquisto: 75, costoPrevisto: 150, ordinato: true, ordinatoIl: new Date() } });
  const rB = await prisma.rigaOrdine.create({ data: { commessaId: c.id, ordineFornitoreId: ord.id, fornitoreId: somfy.id, descrizione: "Telo tenda 300x250", quantita: 1, um: "pz", prezzoAcquisto: 40, costoPrevisto: 40, ordinato: true, ordinatoIl: new Date() } });

  console.log("1. Permessi");
  g.__utente = comm;
  verifica(await lancia(M.creaBolla(fd({ fornitoreId: somfy.id }))), "il commerciale non registra bolle");
  verifica((await F.caricaFattureXml(null, fd({ file: new File([XML], "f.xml") }))).ok === false, "il commerciale non carica fatture");

  console.log("2. Prima bolla: arrivo parziale e mancante");
  g.__utente = admin;
  const b1 = await nuovaBolla({ numeroDdt: "4400" });
  verifica(b1.numero === 1 && b1.stato === "APERTA", "bolla 1 creata aperta");
  await M.aggiungiRigheDaOrdini(fd({ bollaId: b1.id, rigaOrdine: [rA.id, rB.id] }));
  const rb1 = await prisma.rigaBolla.findMany({ where: { bollaId: b1.id }, orderBy: { posizione: "asc" } });
  verifica(rb1.length === 2 && rb1[0].quantitaBolla === 2 && rb1[0].destinazione === "COMMESSA", "righe prese dall'ordine con quantità residua");
  verifica(await lancia(M.registraBolla(fd({ bollaId: b1.id }))), "non si registra con righe da controllare");
  await M.salvaSpunta(fd({ bollaId: b1.id, [`esito_${rb1[0].id}`]: "OK", [`q_${rb1[0].id}`]: "1", [`esito_${rb1[1].id}`]: "MANCANTE" }));
  const sp = await prisma.rigaBolla.findMany({ where: { bollaId: b1.id }, orderBy: { posizione: "asc" } });
  verifica(sp[0].esito === "PARZIALE" && sp[1].esito === "MANCANTE" && sp[1].quantitaRicevuta === 0, "OK con quantità minore diventa parziale", sp.map((x) => x.esito));
  await M.registraBolla(fd({ bollaId: b1.id }));
  let a = await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rA.id } });
  verifica(a.quantitaArrivata === 1 && !a.arrivato, "motore: 1 di 2 arrivato", a);
  verifica(!(await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).materialeCompletoIl, "commessa non ancora completa");
  verifica((await prisma.commessaEvento.count({ where: { commessaId: c.id, testo: { contains: "Da sollecitare" } } })) === 1, "nel diario della commessa il materiale da sollecitare");

  console.log("3. Riapertura e storno");
  await M.riapriBolla(fd({ bollaId: b1.id }));
  a = await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rA.id } });
  verifica(a.quantitaArrivata === 0 && (await prisma.bollaEntrata.findUniqueOrThrow({ where: { id: b1.id } })).stato === "APERTA", "storno: arrivi tornati a zero, bolla aperta");
  await M.registraBolla(fd({ bollaId: b1.id }));

  console.log("4. Seconda bolla: completa il materiale e avvia la commessa");
  const b2 = await nuovaBolla({ numeroDdt: "4512", dataDdt: "2026-10-10" });
  await M.aggiungiRigheDaOrdini(fd({ bollaId: b2.id, rigaOrdine: [rA.id, rB.id] }));
  const rb2 = await prisma.rigaBolla.findMany({ where: { bollaId: b2.id }, orderBy: { posizione: "asc" } });
  verifica(rb2[0].quantitaBolla === 1 && rb2[1].quantitaBolla === 1, "proposta solo la quantità ancora mancante");
  await M.salvaSpunta(fd({ bollaId: b2.id, tuttoOk: "1" }));
  await M.registraBolla(fd({ bollaId: b2.id }));
  const [A2, B2] = await Promise.all([prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rA.id } }), prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rB.id } })]);
  verifica(A2.arrivato && A2.quantitaArrivata === 2 && B2.arrivato, "tutte le righe arrivate");
  verifica((await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: ord.id } })).stato === "EVASO", "ordine fornitore evaso");
  verifica(!!(await prisma.commessa.findUniqueOrThrow({ where: { id: c.id } })).materialeCompletoIl, "commessa con materiale completo");
  const task = await prisma.taskPratica.findMany({ where: { commessaId: c.id, faseChiave: "MATERIALE_COMPLETO" } });
  verifica(task.length === 2 && task.some((t) => t.ufficio === "FATTURAZIONE") && task.some((t) => t.ufficio === "POSA"), "attività di fatturazione saldo e posa create");
  verifica((await prisma.bollaEntrata.findUniqueOrThrow({ where: { id: b2.id } })).stato === "DA_FATTURARE", "bolla 2 da fatturare");

  console.log("5. Scorte: carico, impegno e prelievo per un'altra commessa");
  const b3 = await nuovaBolla({ numeroDdt: "4600" });
  await M.aggiungiRigaBolla(fd({ bollaId: b3.id, articolo: "VITI-6X60 — Viti 6x60 inox", quantita: "5", prezzo: "10" }));
  await M.salvaSpunta(fd({ bollaId: b3.id, tuttoOk: "1" }));
  await M.registraBolla(fd({ bollaId: b3.id }));
  let gi = (await giacenze([art.id])).get(art.id);
  verifica(gi?.giacenza === 5 && gi.costoMedio === 10, "giacenza 5 a 10 €", gi);
  const rC = await prisma.rigaOrdine.create({ data: { commessaId: c2.id, descrizione: "Viti per fissaggio", quantita: 2 } });
  await M.impegnaDaMagazzino(fd({ rigaId: rC.id, articolo: "VITI-6X60" }));
  await M.prelevaDaMagazzino(fd({ rigaId: rC.id }));
  gi = (await giacenze([art.id])).get(art.id);
  const C2 = await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rC.id } });
  verifica(gi?.giacenza === 3 && C2.arrivato && C2.costoEffettivo === 20, "prelievo: giacenza 3, riga disponibile con costo 20 €", { gi, C2 });
  verifica(!!(await prisma.commessa.findUniqueOrThrow({ where: { id: c2.id } })).materialeCompletoIl, "commessa 8 completa col materiale di magazzino");
  await M.annullaPrelievo(fd({ rigaId: rC.id }));
  verifica((await giacenze([art.id])).get(art.id)?.giacenza === 5, "prelievo annullato: giacenza di nuovo 5");
  await M.registraInventario(fd({ articoloId: art.id, [`contata_${art.id}`]: "4" }));
  verifica((await giacenze([art.id])).get(art.id)?.giacenza === 4, "inventario: rettifica a 4");

  console.log("6. Fattura elettronica XML");
  const es = await F.caricaFattureXml(null, fd({ file: new File([XML], "IT01234567890_abc.xml", { type: "text/xml" }) }));
  verifica(es.ok && es.voci[0]?.stato === "NUOVA", "fattura caricata", es);
  const fa = await prisma.fatturaAcquisto.findFirstOrThrow({ include: { righe: { orderBy: { posizione: "asc" } }, bolle: true } });
  verifica(fa.fornitoreId === somfy.id && fa.totale === 244 && fa.stato === "DA_VERIFICARE", "fornitore riconosciuto dalla partita IVA");
  verifica(fa.bolle.some((x) => x.id === b2.id), "bolla collegata dal numero DDT 4512", fa.bolle.map((x) => x.numeroDdt));
  verifica(fa.righe[0].rigaOrdineId === rA.id && fa.righe[0].commessaId === c.id, "riga motore abbinata alla riga d'ordine e alla commessa", fa.righe[0]);
  const es2 = await F.caricaFattureXml(null, fd({ file: new File([XML], "doppia.xml") }));
  verifica(es2.voci[0]?.stato === "DOPPIA" && (await prisma.fatturaAcquisto.count()) === 1, "la stessa fattura non entra due volte");
  await F.registraFatturaAcquisto(fd({ id: fa.id }));
  verifica((await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: fa.id } })).stato === "REGISTRATA", "fattura registrata");
  verifica((await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rA.id } })).costoEffettivo === 150, "costo reale del motore dalla fattura");
  verifica((await prisma.bollaEntrata.findUniqueOrThrow({ where: { id: b2.id } })).stato === "FATTURATA", "bolla 2 fatturata");
  await M.riapriBolla(fd({ bollaId: b2.id }));
  verifica((await prisma.bollaEntrata.findUniqueOrThrow({ where: { id: b2.id } })).stato === "FATTURATA", "una bolla fatturata non si riapre");
  await F.riapriFatturaAcquisto(fd({ id: fa.id }));
  verifica((await prisma.bollaEntrata.findUniqueOrThrow({ where: { id: b2.id } })).stato === "DA_FATTURARE" && (await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: fa.id } })).stato === "DA_VERIFICARE", "riapertura fattura: bolla torna da fatturare");

  console.log("7. Archivio: documenti correlati al cliente");
  for (const [entita, entitaId] of [["CLIENTE", cli.id], ["COMMESSA", c.id], ["BOLLA_ENTRATA", b2.id], ["FATTURA_ACQUISTO", fa.id]] as const)
    await prisma.documento.create({ data: { entita, entitaId, cartella: "Varie", nome: `${entita}.pdf`, mime: "application/pdf", dimensione: 1000, contenuto: Buffer.from("x") } });
  const tuttiAdmin = (await correlatiCliente(admin, cli.id)).flatMap((x) => x.documenti.map((d) => d.nome));
  const tuttiComm = (await correlatiCliente(comm, cli.id)).flatMap((x) => x.documenti.map((d) => d.nome));
  verifica(["CLIENTE.pdf", "COMMESSA.pdf", "BOLLA_ENTRATA.pdf", "FATTURA_ACQUISTO.pdf"].every((n) => tuttiAdmin.includes(n)), "l'amministrativo vede tutta la catena", tuttiAdmin);
  verifica(tuttiComm.includes("COMMESSA.pdf") && !tuttiComm.includes("BOLLA_ENTRATA.pdf") && !tuttiComm.includes("FATTURA_ACQUISTO.pdf"), "il commerciale non vede bolle e fatture d'acquisto", tuttiComm);

  console.log(`\n${ok} superati, ${ko} falliti`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
