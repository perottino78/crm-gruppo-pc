// Collaudo: pagamenti e incassi registrati a mano (banca, metodo, commissione, ritenuta 11%), conferma con l'estratto conto,
// proforma → fattura definitiva, fatture di vendita importate dagli XML di BConsole.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/fatture-incassi.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { registraPagamento, annullaPagamento } from "../../src/app/pagamenti-actions";
import { confermaImport, anteprimaImport } from "../../src/app/amministrazione-actions";
import { creaFatturaManuale, registraFatturaAcquisto, collegaProforma, assegnaCommessaATutte } from "../../src/app/fatture-actions";
import { salvaFatturaVendita, eliminaFatturaVendita } from "../../src/app/vendite-actions";
import { importaFatturaVendita } from "../../src/lib/fatture/vendite";
import { importaFattura } from "../../src/lib/fatture/server";
import { leggiFatturaPA } from "../../src/lib/fatture/fatturapa";
import { residuoScadenza } from "../../src/lib/amministrazione/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent((d.split(";")[2] ?? "").replace(/\+/g, " ")); } };
const scad = (id: string) => prisma.scadenza.findUniqueOrThrow({ where: { id }, include: { abbinamenti: true } });

const xmlVendita = (o: { numero: string; data: string; cf: string; nome: string; imponibile: number; iva: number; causale: string; cedente?: string }) => `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"><FatturaElettronicaHeader>
<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${o.cedente ?? "10741080013"}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>P&amp;C S.R.L.</Denominazione></Anagrafica></DatiAnagrafici><Sede><Indirizzo>Corso Moncenisio</Indirizzo><CAP>10090</CAP><Comune>Rosta</Comune></Sede></CedentePrestatore>
<CessionarioCommittente><DatiAnagrafici><CodiceFiscale>${o.cf}</CodiceFiscale><Anagrafica><Nome>${o.nome.split(" ")[0]}</Nome><Cognome>${o.nome.split(" ")[1]}</Cognome></Anagrafica></DatiAnagrafici><Sede><Indirizzo>Via Roma 1</Indirizzo><Comune>Rivoli</Comune></Sede></CessionarioCommittente>
</FatturaElettronicaHeader><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>${o.data}</Data><Numero>${o.numero}</Numero><ImportoTotaleDocumento>${(o.imponibile + o.iva).toFixed(2)}</ImportoTotaleDocumento><Causale>${o.causale}</Causale></DatiGeneraliDocumento></DatiGenerali>
<DatiBeniServizi><DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Fornitura e posa serramenti</Descrizione><PrezzoTotale>${o.imponibile.toFixed(2)}</PrezzoTotale><AliquotaIVA>10.00</AliquotaIVA></DettaglioLinee>
<DatiRiepilogo><AliquotaIVA>10.00</AliquotaIVA><ImponibileImporto>${o.imponibile.toFixed(2)}</ImponibileImporto><Imposta>${o.iva.toFixed(2)}</Imposta></DatiRiepilogo></DatiBeniServizi></FatturaElettronicaBody></p:FatturaElettronica>`;

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "AbbinamentoScadenza","MovimentoFinanziario","ImportazioneEstratto","Scadenza","CostoManuale","RigaFatturaAcquisto","FatturaAcquisto","FatturaVendita","Documento","CommessaEvento","Commessa","Preventivo","Cliente","Soggetto","ContoFinanziario","ChiusuraMese","RegistroAmministrazione","Utente","Brand" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const debora = await prisma.utente.create({ data: { nome: "Debora Girodo", email: "debora@x.it", ruolo: "AMMINISTRATIVO" } });
  const comm = await prisma.utente.create({ data: { nome: "Marco", email: "m@x.it", ruolo: "COMMERCIALE" } });
  const bper = await prisma.contoFinanziario.create({ data: { nome: "Banca BPER", tipo: "BANCA", dataSaldoIniziale: new Date("2026-01-01T12:00:00Z") } });
  const cassa = await prisma.contoFinanziario.create({ data: { nome: "Cassa contanti", tipo: "CASSA", dataSaldoIniziale: new Date("2026-01-01T12:00:00Z") } });
  const forn = await prisma.soggetto.create({ data: { ragioneSociale: "IDROCENTRO SPA", ruoli: ["FORNITORE"], partitaIva: "01234567890" } });
  const cli = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", brandId: brand.id, codiceFiscale: "RSSMRA70A01L219X" } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: comm.id } });
  const c = await prisma.commessa.create({ data: { numero: 12, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: brand.id } });
  g.__utente = debora;

  console.log("1. Pagamento a un fornitore con bonifico e commissione");
  const s1 = await prisma.scadenza.create({ data: { tipo: "PAGAMENTO", descrizione: "Fattura 1391", controparte: "IDROCENTRO SPA", importo: 2947.29, dataScadenza: new Date("2026-11-10T12:00:00Z"), brand: "P&C" } });
  g.__utente = comm;
  const d0 = await dove(registraPagamento(fd({ scadenzaId: s1.id, data: "2026-11-03", importo: "2947,29", contoId: bper.id, metodo: "BONIFICO" })));
  verifica(d0?.includes("errore=Non autorizzato"), "un commerciale non registra pagamenti", d0);
  g.__utente = debora;
  const d1 = await dove(registraPagamento(fd({ scadenzaId: s1.id, data: "2026-11-03", importo: "2947,29", contoId: bper.id, metodo: "BONIFICO", commissione: "1,50", ritorno: "/amministrazione/scadenzario?tipo=PAGAMENTO" })));
  const m1 = await prisma.movimentoFinanziario.findMany({ where: { contoId: bper.id }, orderBy: { importo: "asc" } });
  verifica(m1.length === 2 && m1[0].importo === -2947.29 && m1[0].metodo === "BONIFICO" && m1[0].daConfermare && m1[0].stato === "ABBINATO", "uscita dalla banca, da confermare con l'estratto", m1[0]);
  verifica(m1[1].importo === -1.5 && m1[1].categoria === "Commissioni e spese bancarie" && m1[1].commissioneDiId === m1[0].id, "commissione a parte, legata al pagamento", m1[1]);
  verifica((await scad(s1.id)).stato === "PAGATA", "scadenza saldata");
  verifica(d1?.startsWith("/amministrazione/scadenzario?tipo=PAGAMENTO&ok=") && d1.includes("Scadenza saldata"), "si torna allo scadenzario filtrato con il messaggio", d1);

  console.log("2. Pagamento parziale, troppo alto, annullato");
  const s2 = await prisma.scadenza.create({ data: { tipo: "PAGAMENTO", descrizione: "Proforma vetri", controparte: "VETRERIA", importo: 1000 } });
  await dove(registraPagamento(fd({ scadenzaId: s2.id, data: "2026-11-04", importo: "400", contoId: bper.id, metodo: "CARTA_CREDITO" })));
  verifica((await scad(s2.id)).stato === "PARZIALE" && residuoScadenza(await scad(s2.id)) === 600, "parziale: restano 600");
  const d2 = await dove(registraPagamento(fd({ scadenzaId: s2.id, data: "2026-11-04", importo: "700", contoId: bper.id, metodo: "BONIFICO" })));
  verifica(d2?.includes("errore=") && d2.includes("residuo"), "non si paga più del residuo", d2);
  const mp = await prisma.movimentoFinanziario.findFirstOrThrow({ where: { abbinamenti: { some: { scadenzaId: s2.id } } } });
  await dove(annullaPagamento(fd({ movimentoId: mp.id })));
  verifica((await scad(s2.id)).stato === "APERTA" && !(await prisma.movimentoFinanziario.findUnique({ where: { id: mp.id } })), "pagamento annullato: scadenza di nuovo aperta");
  await dove(registraPagamento(fd({ scadenzaId: s2.id, data: "2026-11-04", importo: "1000", contoId: cassa.id, metodo: "CONTANTI" })));
  verifica((await prisma.movimentoFinanziario.findFirstOrThrow({ where: { contoId: cassa.id } })).daConfermare === false, "contanti in cassa: niente da confermare con l'estratto");

  console.log("3. Estratto conto: il bonifico registrato a mano non si raddoppia");
  const csv = ["Data contabile;Data valuta;Descrizione;Importo;Divisa",
    "05/11/2026;05/11/2026;BONIFICO A IDROCENTRO SPA FT 1391;-2.947,29;EUR",
    "05/11/2026;05/11/2026;COMMISSIONI BONIFICO;-1,50;EUR",
    "06/11/2026;06/11/2026;ADDEBITO TELEPASS;-35,00;EUR"].join("\n");
  const ant = await anteprimaImport(bper.id, csv);
  verifica(ant.ok && ant.nuove === 1 && ant.errore?.includes("2 movimenti erano già stati registrati a mano"), "anteprima: 1 nuovo, 2 già registrati a mano", ant);
  const imp = await confermaImport(bper.id, csv, "bper.csv", null);
  const tutti = await prisma.movimentoFinanziario.findMany({ where: { contoId: bper.id } });
  verifica(imp.ok && tutti.length === 3, "in banca 3 movimenti, non 5", tutti.map((m) => m.descrizione));
  const conf = await prisma.movimentoFinanziario.findUniqueOrThrow({ where: { id: m1[0].id } });
  verifica(conf.confermatoIl && !conf.daConfermare && conf.data.toISOString().startsWith("2026-11-05"), "pagamento confermato con la data della banca", conf);
  const imp2 = await confermaImport(bper.id, csv, "bper.csv", null);
  verifica(imp2.ok && (await prisma.movimentoFinanziario.count({ where: { contoId: bper.id } })) === 3, "reimportando lo stesso estratto non entra nulla");
  const d3 = await dove(annullaPagamento(fd({ movimentoId: conf.id })));
  verifica(d3?.includes("errore=") && d3.includes("confermato"), "un pagamento confermato dalla banca non si annulla da qui", d3);

  console.log("4. Proforma pagata, poi la fattura definitiva");
  await dove(creaFatturaManuale(fd({ fornitoreId: forn.id, tipoDocumento: "PROFORMA", numero: "PF-77", data: "2026-11-02", imponibile: "1000", iva: "220", divisione: "P&C", modoPagamento: "BONIFICO", bancaPrevista: "Banca BPER", commessa: "C2026-012 · ROSSI MARIO" })));
  const pf = await prisma.fatturaAcquisto.findFirstOrThrow({ where: { numero: "PF-77" }, include: { righe: true } });
  verifica(pf.tipoDocumento === "PROFORMA" && pf.righe[0].commessaId === c.id && pf.modoPagamento === "BONIFICO", "proforma creata sulla commessa cercata per nome", pf);
  await dove(registraFatturaAcquisto(fd({ id: pf.id })));
  const sPf = await prisma.scadenza.findFirstOrThrow({ where: { chiaveImport: `FA:${pf.id}:0` } });
  verifica(sPf.descrizione.startsWith("Proforma PF-77"), "scadenza della proforma", sPf.descrizione);
  await dove(registraPagamento(fd({ scadenzaId: sPf.id, data: "2026-11-06", importo: "1220", contoId: bper.id, metodo: "BONIFICO" })));
  verifica((await prisma.costoManuale.aggregate({ where: { commessaId: c.id }, _sum: { importo: true } }))._sum.importo === 1000, "costo della proforma sulla commessa");
  await dove(creaFatturaManuale(fd({ fornitoreId: forn.id, tipoDocumento: "TD01", numero: "1500/2026", data: "2026-11-09", imponibile: "1000", iva: "220", divisione: "P&C" })));
  const ft = await prisma.fatturaAcquisto.findFirstOrThrow({ where: { numero: "1500/2026" } });
  await dove(assegnaCommessaATutte(fd({ id: ft.id, commessa: "C2026-012 · ROSSI MARIO" })));
  await dove(collegaProforma(fd({ id: ft.id, proformaId: pf.id })));
  verifica((await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: ft.id } })).proformaId === pf.id, "fattura collegata alla proforma");
  const d4 = await dove(registraFatturaAcquisto(fd({ id: ft.id })));
  const sFt = await prisma.scadenza.findFirstOrThrow({ where: { chiaveImport: `FA:${ft.id}:0` }, include: { abbinamenti: true } });
  verifica(sFt.stato === "PAGATA" && sFt.abbinamenti[0]?.importo === 1220, "il pagamento della proforma è passato sulla fattura", sFt);
  verifica((await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: pf.id } })).stato === "SOSTITUITA" && (await scad(sPf.id)).stato === "ANNULLATA", "proforma sostituita, la sua scadenza chiusa");
  verifica((await prisma.costoManuale.aggregate({ where: { commessaId: c.id }, _sum: { importo: true } }))._sum.importo === 1000, "costo contato una volta sola sulla commessa");
  verifica(d4?.includes("Proforma PF-77 sostituita"), "messaggio dopo la registrazione", d4);

  console.log("5. Fatture di vendita dagli XML di BConsole");
  const acconto = await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Saldo commessa", controparte: "ROSSI MARIO", clienteId: cli.id, commessaId: c.id, origine: "COMMESSA_SALDO", importo: 11000 } });
  const [fv1] = leggiFatturaPA(xmlVendita({ numero: "36/FO", data: "2026-11-03", cf: "RSSMRA70A01L219X", nome: "Mario Rossi", imponibile: 10000, iva: 1000, causale: "Lavori con detrazione fiscale 50%" }));
  const r1 = await importaFatturaVendita(fv1, { xml: null, origine: "XML", creatoDaNome: "Debora" });
  const fv = await prisma.fatturaVendita.findUniqueOrThrow({ where: { id: r1.id! } });
  verifica(r1.stato === "NUOVA" && fv.clienteId === cli.id && fv.commessaId === c.id && fv.detrazione && fv.sezionale === "FO", "cliente riconosciuto dal codice fiscale, commessa, detrazione, sezionale", fv);
  const sa = await prisma.scadenza.findUniqueOrThrow({ where: { id: acconto.id } });
  verifica(sa.fatturaVenditaId === fv.id && (await prisma.scadenza.count({ where: { fatturaVenditaId: fv.id } })) === 1, "agganciata al saldo della commessa: nessun incasso doppio");
  verifica((await importaFatturaVendita(fv1, { xml: null, origine: "XML", creatoDaNome: "Debora" })).stato === "DOPPIA", "ricaricata: riconosciuta come doppia");
  await dove(registraPagamento(fd({ scadenzaId: acconto.id, data: "2026-11-07", importo: "9900", ritenuta: "1100", contoId: bper.id, metodo: "BONIFICO_DETRAZIONE" })));
  const sa2 = await scad(acconto.id);
  verifica(sa2.stato === "PAGATA" && sa2.ritenuta === 1100 && residuoScadenza(sa2) === 0, "bonifico per detrazione: accreditati 9.900 + ritenuta 1.100 = saldata", sa2);
  const inc = await prisma.movimentoFinanziario.findFirstOrThrow({ where: { abbinamenti: { some: { scadenzaId: acconto.id } } } });
  await dove(annullaPagamento(fd({ movimentoId: inc.id })));
  verifica((await scad(acconto.id)).ritenuta === 0 && (await scad(acconto.id)).stato === "APERTA", "annullando l'incasso si toglie anche la ritenuta");

  console.log("6. Fattura con cliente non riconosciuto, collegata a mano; controlli sul tipo");
  const [fv2x] = leggiFatturaPA(xmlVendita({ numero: "37", data: "2026-11-04", cf: "VRDLGU80A01L219Y", nome: "Luigi Verdi", imponibile: 500, iva: 110, causale: "Riparazione" }));
  const r2 = await importaFatturaVendita(fv2x, { xml: null, origine: "XML", creatoDaNome: "Debora" });
  const s37 = await prisma.scadenza.findFirstOrThrow({ where: { fatturaVenditaId: r2.id } });
  verifica(s37.origine === "FATTURA_VENDITA" && s37.importo === 610 && s37.controparte === "Luigi Verdi", "senza cliente nel CRM: scadenza di incasso propria", s37);
  const verdi = await prisma.cliente.create({ data: { nome: "VERDI LUIGI", brandId: brand.id } });
  await dove(salvaFatturaVendita(fd({ id: r2.id!, cliente: "verdi luigi", brand: "P&C" })));
  verifica((await prisma.fatturaVendita.findUniqueOrThrow({ where: { id: r2.id } })).clienteId === verdi.id && (await scad(s37.id)).clienteId === verdi.id, "cliente collegato dall'elenco");
  const [acq] = leggiFatturaPA(xmlVendita({ numero: "99", data: "2026-11-04", cf: "X", nome: "A B", imponibile: 1, iva: 0, causale: "", cedente: "01234567890" }));
  verifica((await importaFatturaVendita(acq, { xml: null, origine: "XML", creatoDaNome: "D" })).stato === "ERRORE", "una fattura d'acquisto non entra tra le vendite");
  verifica((await importaFattura(fv1, { xml: null, origine: "XML", creatoDaNome: "D" })).messaggio?.includes("vendita"), "una nostra fattura non entra tra gli acquisti");
  const d6 = await dove(eliminaFatturaVendita(fd({ id: r2.id! })));
  verifica(d6?.includes("ok=") && !(await prisma.scadenza.findUnique({ where: { id: s37.id } })), "eliminata (senza incassi) con le sue scadenze");

  await prisma.$disconnect();
  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
