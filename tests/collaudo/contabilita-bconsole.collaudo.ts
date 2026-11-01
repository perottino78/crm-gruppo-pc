// Collaudo: import della contabilità da BConsole (fatture di vendita e d'acquisto con lo stato delle rate), rilanciabile.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/contabilita-bconsole.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { importaVenditaBC, importaAcquistoBC, esitoVuoto, type DocumentoBC } from "../../src/lib/amministrazione/bconsole";
import { residuoScadenza } from "../../src/lib/amministrazione/server";
import { importaFattura } from "../../src/lib/fatture/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };

const vendita = (o: Partial<DocumentoBC> & { rate: DocumentoBC["rate"] }): DocumentoBC => ({ tipo: "VENDITA", bcId: "4180", sigla: "FAC", numero: "290/FE/2026", data: "2026-06-30", controparte: "DE PASCALI NADIA", bcAnagrafica: "28864", imponibile: 3636.36, iva: 363.64, totale: 4000, riferimento: "FATTURA SECONDO ACCONTO", tipologia: "P&C", progetti: ["630/26"], ...o });
const acquisto = (o: Partial<DocumentoBC> & { rate: DocumentoBC["rate"] }): DocumentoBC => ({ tipo: "ACQUISTO", bcId: "10435", sigla: "FS", numero: "VL-18364", protocollo: "1391/2026", data: "2026-09-23", controparte: "IDROCENTRO SPA", partitaIva: "01234567890", imponibile: 2415.81, iva: 531.48, totale: 2947.29, riferimento: "Riferim. AEG", tipologia: null, ...o });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "AbbinamentoScadenza","MovimentoFinanziario","Scadenza","RigaFatturaAcquisto","FatturaAcquisto","FatturaVendita","CommessaEvento","Commessa","Preventivo","Cliente","Soggetto","RegistroAmministrazione","Utente","Brand" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo", email: "u@x.it", ruolo: "AMMINISTRATORE" } });
  const nadia = await prisma.cliente.create({ data: { nome: "DE PASCALI NADIA", brandId: brand.id, bconsoleId: "28864" } });
  const idro = await prisma.soggetto.create({ data: { ragioneSociale: "IDROCENTRO SPA", ruoli: ["FORNITORE"], partitaIva: "01234567890" } });

  console.log("1. Fattura di vendita saldata, con la ritenuta");
  const e = esitoVuoto();
  await importaVenditaBC(vendita({ rate: [
    { bcId: "25434", descrizione: "SALDO FT", scadenza: "2026-06-30", importo: 3639.34, stato: "Saldata", pagataIl: "2026-07-02", metodo: "bonifico", banca: "Banca BPER" },
    { bcId: "25435", descrizione: "Scad. 1/1", scadenza: "2026-06-30", importo: 360.66, stato: "Rit. Fis Compensazione" },
  ] }), e);
  const fv = await prisma.fatturaVendita.findFirstOrThrow({ where: { numero: "290/FE/2026" } });
  verifica(fv.clienteId === nadia.id && fv.tipoDocumento === "TD02" && fv.detrazione && fv.origine === "BCONSOLE" && fv.sezionale === "FE", "cliente dal n. anagrafica BConsole, acconto, detrazione", fv);
  const sc = await prisma.scadenza.findMany({ where: { fatturaVenditaId: fv.id }, include: { abbinamenti: true }, orderBy: { importo: "desc" } });
  verifica(sc.length === 2 && sc.every((s) => s.stato === "PAGATA" && residuoScadenza(s) === 0), "entrambe le rate saldate", sc.map((s) => [s.importo, s.stato, s.pagatoManuale, s.ritenuta]));
  verifica(sc[0].note?.includes("Saldata in BConsole il 02/07/2026 (bonifico · Banca BPER)") && sc[1].ritenuta === 360.66, "data, metodo e banca nella nota; ritenuta registrata");

  console.log("2. Fattura aperta, poi pagata: il secondo import aggiorna lo stato");
  const aperta = vendita({ bcId: "4178", sigla: "FAC", numero: "288/FE/2026", controparte: "ARTENE NICOLAE", bcAnagrafica: "28944", imponibile: 6332.27, iva: 633.23, totale: 6965.5, rate: [{ bcId: "25352", descrizione: "Scad. 1/1", scadenza: "2026-06-29", importo: 6965.5, stato: "Insoluta" }] });
  const e2 = esitoVuoto();
  await importaVenditaBC(aperta, e2);
  const s288 = await prisma.scadenza.findFirstOrThrow({ where: { chiaveImport: "BCV:25352" } });
  verifica(s288.stato === "APERTA" && s288.controparte === "ARTENE NICOLAE" && !s288.clienteId, "insoluta: da incassare (cliente non nel CRM: tenuto il nome)", s288);
  const e3 = esitoVuoto();
  await importaVenditaBC({ ...aperta, rate: [{ ...aperta.rate[0], stato: "Saldata", pagataIl: "2026-11-10", metodo: "bonifico" }] }, e3);
  verifica(e3.aggiornate === 1 && (await prisma.scadenza.findUniqueOrThrow({ where: { id: s288.id } })).stato === "PAGATA", "rilanciato: ora risulta saldata", e3);
  const e4 = esitoVuoto();
  await importaVenditaBC({ ...aperta, rate: [{ ...aperta.rate[0], stato: "Saldata", pagataIl: "2026-11-10", metodo: "bonifico" }] }, e4);
  verifica(e4.invariate === 1 && (await prisma.fatturaVendita.count()) === 2, "rilanciato di nuovo: nessun cambiamento, nessun doppione", e4);

  console.log("3. Pagamento registrato nel CRM: BConsole non lo cancella");
  const conto = await prisma.contoFinanziario.create({ data: { nome: "BPER", dataSaldoIniziale: new Date("2026-01-01T12:00:00Z") } });
  const fv3 = vendita({ bcId: "5000", sigla: "FT", numero: "300/FE/2026", controparte: "DE PASCALI NADIA", imponibile: 1000, iva: 100, totale: 1100, rate: [{ bcId: "26000", descrizione: "", scadenza: "2026-11-30", importo: 1100, stato: "Aperta" }] });
  await importaVenditaBC(fv3, esitoVuoto());
  const s300 = await prisma.scadenza.findFirstOrThrow({ where: { chiaveImport: "BCV:26000" } });
  const m = await prisma.movimentoFinanziario.create({ data: { contoId: conto.id, data: new Date(), importo: 400, descrizione: "acconto", impronta: "x1", stato: "ABBINATO" } });
  await prisma.abbinamentoScadenza.create({ data: { movimentoId: m.id, scadenzaId: s300.id, importo: 400 } });
  await importaVenditaBC({ ...fv3, rate: [{ ...fv3.rate[0], stato: "Saldata" }] }, esitoVuoto());
  const s300b = await prisma.scadenza.findUniqueOrThrow({ where: { id: s300.id }, include: { abbinamenti: true } });
  verifica(s300b.abbinamenti.length === 1 && s300b.pagatoManuale === 700 && s300b.stato === "PAGATA", "incasso del CRM tenuto, BConsole completa il resto", s300b);

  console.log("4. Si aggancia all'incasso già aperto della commessa (niente doppioni)");
  const prev = await prisma.preventivo.create({ data: { clienteId: nadia.id, brandId: brand.id, commercialeId: ugo.id } });
  const c = await prisma.commessa.create({ data: { numero: 1, anno: 2026, preventivoId: prev.id, clienteId: nadia.id, brandId: brand.id } });
  const acc = await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Acconto", controparte: "DE PASCALI NADIA", clienteId: nadia.id, commessaId: c.id, origine: "COMMESSA_ACCONTO", importo: 2500 } });
  await importaVenditaBC(vendita({ bcId: "5001", numero: "301/FE/2026", imponibile: 2272.73, iva: 227.27, totale: 2500, rate: [{ bcId: "26001", descrizione: "", scadenza: "2026-11-05", importo: 2500, stato: "Saldata", pagataIl: "2026-11-06" }] }), esitoVuoto());
  const acc2 = await prisma.scadenza.findUniqueOrThrow({ where: { id: acc.id } });
  verifica(acc2.fatturaVenditaId && acc2.stato === "PAGATA" && (await prisma.scadenza.count({ where: { chiaveImport: "BCV:26001" } })) === 0, "agganciata all'acconto della commessa e saldata", acc2);

  console.log("5. Note di credito e rate stornate");
  await importaVenditaBC(vendita({ bcId: "4136", sigla: "FT", numero: "250/FE/2026", controparte: "CAIVANO GROUP SRL", imponibile: -11518.18, iva: -1151.82, totale: -12670, rate: [{ bcId: "1", descrizione: "", scadenza: null, importo: -12670, stato: "Saldata" }] }), esitoVuoto());
  const nc = await prisma.fatturaVendita.findFirstOrThrow({ where: { numero: "250/FE/2026" } });
  verifica(nc.tipoDocumento === "TD04" && nc.totale === -12670 && (await prisma.scadenza.count({ where: { fatturaVenditaId: nc.id } })) === 0, "nota di credito: nessun incasso");
  await importaAcquistoBC(acquisto({ bcId: "9", numero: "X-1", rate: [{ bcId: "r9", descrizione: "", scadenza: "2026-10-01", importo: 100, stato: "Stornata" }] }), esitoVuoto());
  verifica((await prisma.scadenza.findFirstOrThrow({ where: { chiaveImport: { endsWith: ":bcr9" } } })).stato === "ANNULLATA", "rata stornata: annullata");

  console.log("6. Fatture d'acquisto e fornitori");
  const ea = esitoVuoto();
  await importaAcquistoBC(acquisto({ rate: [{ bcId: "26914", descrizione: "Scad. n. 1/1", scadenza: "2026-10-31", importo: 2947.29, stato: "Insoluta" }] }), ea);
  const fa = await prisma.fatturaAcquisto.findFirstOrThrow({ where: { numero: "VL-18364" }, include: { righe: true } });
  verifica(fa.fornitoreId === idro.id && fa.stato === "REGISTRATA" && fa.origine === "BCONSOLE" && fa.righe.length === 1 && fa.note?.includes("protocollo 1391/2026"), "fornitore per P.IVA, registrata, protocollo BConsole", fa);
  const sfa = await prisma.scadenza.findFirstOrThrow({ where: { chiaveImport: `FA:${fa.id}:bc26914` } });
  verifica(sfa.tipo === "PAGAMENTO" && sfa.stato === "APERTA" && sfa.dataScadenza?.toISOString().startsWith("2026-10-31"), "da pagare, con la scadenza giusta", sfa);
  await importaAcquistoBC(acquisto({ bcId: "10628", numero: "001351202694400357", protocollo: "1586/2026", controparte: "DIMAR S.P.A.", partitaIva: "09876543210", imponibile: 228.03, iva: 29.93, totale: 257.96, rate: [{ bcId: "27775", descrizione: "", scadenza: "2026-10-31", importo: 257.96, stato: "Saldata", pagataIl: "2026-10-31", metodo: "carta di pagamento" }] }), ea);
  const dimar = await prisma.soggetto.findFirstOrThrow({ where: { ragioneSociale: "DIMAR S.P.A." } });
  verifica(dimar.ruoli.includes("FORNITORE") && dimar.partitaIva === "09876543210" && ea.fornitoriCreati === 1, "fornitore nuovo creato una volta sola", ea);
  await importaAcquistoBC(acquisto({ bcId: "10629", numero: "001351202694400358", controparte: "Dimar S.p.A.", partitaIva: "IT09876543210", rate: [] }), ea);
  verifica((await prisma.soggetto.count({ where: { partitaIva: { contains: "09876543210" } } })) === 1, "stesso fornitore riconosciuto dalla P.IVA (niente doppioni)");
  await importaAcquistoBC(acquisto({ bcId: "11", sigla: "FP", numero: "PF-9", rate: [{ bcId: "r11", descrizione: "", scadenza: "2026-05-01", importo: 500, stato: "Chiusa" }] }), ea);
  verifica((await prisma.fatturaAcquisto.findFirstOrThrow({ where: { numero: "PF-9" } })).tipoDocumento === "PROFORMA", "proforma riconosciuta");

  console.log("7. La stessa fattura arrivata prima dal cassetto fiscale (XML) non si duplica");
  const xml = await importaFattura({ fornitore: { denominazione: "IDROCENTRO SPA", partitaIva: "01234567890", codiceFiscale: null, indirizzo: null, cap: null, comune: null, provincia: null, email: null }, cliente: { denominazione: "P&C", partitaIva: "10741080013", codiceFiscale: null, indirizzo: null, comune: null }, tipoDocumento: "TD01", notaCredito: false, numero: "VL-99", data: "2026-08-01", divisa: "EUR", totale: 122, imponibile: 100, iva: 22, causale: "", righe: [], scadenze: [], ddt: [], ordini: [] }, { xml: null, origine: "XML", creatoDaNome: "Debora" });
  const ed = esitoVuoto();
  await importaAcquistoBC(acquisto({ bcId: "12", numero: "VL-99", data: "2026-08-01", imponibile: 100, iva: 22, totale: 122, rate: [{ bcId: "r12", descrizione: "", scadenza: "2026-09-01", importo: 122, stato: "Saldata" }] }), ed);
  verifica(xml.stato === "NUOVA" && ed.doppie === 1 && (await prisma.fatturaAcquisto.count({ where: { numero: "VL-99" } })) === 1, "riconosciuta come già presente", ed);

  console.log("8. E il contrario: l'XML caricato dopo l'import BConsole è riconosciuto");
  const x1 = await importaFattura({ fornitore: { denominazione: "IDROCENTRO SPA", partitaIva: "IT01234567890", codiceFiscale: null, indirizzo: null, cap: null, comune: null, provincia: null, email: null }, cliente: { denominazione: "P&C", partitaIva: "10741080013", codiceFiscale: null, indirizzo: null, comune: null }, tipoDocumento: "TD24", notaCredito: false, numero: "VL-18364", data: "2026-09-23", divisa: "EUR", totale: 2947.29, imponibile: 2415.81, iva: 531.48, causale: "", righe: [], scadenze: [], ddt: [], ordini: [] }, { xml: null, origine: "XML", creatoDaNome: "Debora" });
  verifica(x1.stato === "DOPPIA", "fattura d'acquisto già importata da BConsole", x1);
  const { importaFatturaVendita } = await import("../../src/lib/fatture/vendite");
  const x2 = await importaFatturaVendita({ fornitore: { denominazione: "P&C", partitaIva: "10741080013", codiceFiscale: null, indirizzo: null, cap: null, comune: null, provincia: null, email: null }, cliente: { denominazione: "DE PASCALI NADIA", partitaIva: null, codiceFiscale: null, indirizzo: null, comune: null }, tipoDocumento: "TD02", notaCredito: false, numero: "290/FE/2026", data: "2026-06-30", divisa: "EUR", totale: 4000, imponibile: 3636.36, iva: 363.64, causale: "", righe: [], scadenze: [], ddt: [], ordini: [] }, { xml: null, origine: "XML", creatoDaNome: "Debora" });
  verifica(x2.stato === "DOPPIA", "fattura di vendita già importata da BConsole", x2);

  console.log("9. Prova senza scrivere");
  const ep = esitoVuoto();
  const prima = await prisma.fatturaVendita.count();
  await importaVenditaBC(vendita({ bcId: "999", numero: "999/FE/2026", rate: [] }), ep, true);
  verifica(ep.nuove === 1 && (await prisma.fatturaVendita.count()) === prima, "conta senza creare nulla");

  await prisma.$disconnect();
  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
