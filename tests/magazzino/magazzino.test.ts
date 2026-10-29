import { test } from "node:test";
import assert from "node:assert/strict";
import { pianoBolla, quantitaUtile, materialeCompleto, riepilogoMovimenti, disponibilita, abbinaRighe, somiglianza, differenzaInventario, riepilogoMateriale, leggiQuantita, giorniRitardo } from "../../src/lib/magazzino/calcoli";
import { leggiFatturaPA, estraiXml, leggiFileFatture, chiaveFattura, divisioneDaCliente, parseXml, trova } from "../../src/lib/fatture/fatturapa";
import { normalizzaFatturaAi, normalizzaBollaAi } from "../../src/lib/fatture/ai";
import { scriviZip } from "../../src/lib/articoli/foglio";

const ro = (id: string, quantita: number, extra: Partial<{ quantitaArrivata: number; commessaId: string | null; prezzoAcquisto: number | null; scontoAcquisto: number | null }> = {}) =>
  ({ id, quantita, quantitaArrivata: 0, arrivato: false, ordineFornitoreId: "O1", commessaId: "C1", prezzoAcquisto: null, scontoAcquisto: null, ...extra });
const rb = (id: string, x: Partial<{ esito: string; quantitaBolla: number; quantitaRicevuta: number | null; destinazione: string; rigaOrdineId: string | null; articoloId: string | null; prezzo: number | null }>) =>
  ({ id, esito: "OK", quantitaBolla: 1, quantitaRicevuta: null, destinazione: "COMMESSA", rigaOrdineId: null, articoloId: null, prezzo: null, ...x });

test("quantità utile per esito", () => {
  assert.equal(quantitaUtile({ esito: "OK", quantitaBolla: 5, quantitaRicevuta: null }), 5);
  assert.equal(quantitaUtile({ esito: "PARZIALE", quantitaBolla: 5, quantitaRicevuta: 3 }), 3);
  assert.equal(quantitaUtile({ esito: "MANCANTE", quantitaBolla: 5, quantitaRicevuta: 5 }), 0);
  assert.equal(quantitaUtile({ esito: "DANNEGGIATO", quantitaBolla: 5, quantitaRicevuta: 5 }), 0);
  assert.equal(quantitaUtile({ esito: "DA_CONTROLLARE", quantitaBolla: 5, quantitaRicevuta: null }), 0);
});

test("arrivi parziali su due bolle e storno", () => {
  const ordine = [ro("R1", 10, { prezzoAcquisto: 100, scontoAcquisto: 20 })];
  const p1 = pianoBolla([rb("B1", { rigaOrdineId: "R1", esito: "PARZIALE", quantitaBolla: 10, quantitaRicevuta: 6 })], ordine);
  assert.deepEqual([p1.righeOrdine[0].quantitaArrivata, p1.righeOrdine[0].arrivato], [6, false]);
  const dopo1 = [{ ...ordine[0], quantitaArrivata: 6 }];
  const p2 = pianoBolla([rb("B2", { rigaOrdineId: "R1", quantitaBolla: 4 })], dopo1);
  assert.deepEqual([p2.righeOrdine[0].quantitaArrivata, p2.righeOrdine[0].arrivato], [10, true]);
  const storno = pianoBolla([rb("B2", { rigaOrdineId: "R1", quantitaBolla: 4 })], [{ ...ordine[0], quantitaArrivata: 10, arrivato: true }], -1);
  assert.deepEqual([storno.righeOrdine[0].quantitaArrivata, storno.righeOrdine[0].arrivato], [6, false]);
  const troppo = pianoBolla([rb("B3", { rigaOrdineId: "R1", quantitaBolla: 12 })], ordine);
  assert.equal(troppo.righeOrdine[0].arrivato, true);
  assert.ok(troppo.avvisi.length === 1);
});

test("carichi a magazzino con costo netto dall'ordine", () => {
  const p = pianoBolla([rb("B1", { rigaOrdineId: "R1", destinazione: "MAGAZZINO", articoloId: "A1", quantitaBolla: 3 })], [ro("R1", 3, { commessaId: null, prezzoAcquisto: 50, scontoAcquisto: 10 })]);
  assert.deepEqual(p.carichi, [{ rigaBollaId: "B1", articoloId: "A1", quantita: 3, costoUnitario: 45, rigaOrdineId: "R1" }]);
  const senza = pianoBolla([rb("B1", { destinazione: "MAGAZZINO", quantitaBolla: 3 })], []);
  assert.equal(senza.carichi.length, 0);
  assert.equal(senza.avvisi.length, 1);
  const mancante = pianoBolla([rb("B1", { destinazione: "MAGAZZINO", articoloId: "A1", esito: "MANCANTE" })], []);
  assert.equal(mancante.carichi.length, 0);
});

test("materiale completo e riepilogo", () => {
  assert.equal(materialeCompleto([]), false);
  assert.equal(materialeCompleto([{ arrivato: true }, { arrivato: true }]), true);
  assert.equal(materialeCompleto([{ arrivato: true }, { arrivato: false }]), false);
  const r = riepilogoMateriale([
    { arrivato: true, ordinato: true, ordineFornitoreId: "O", daMagazzino: false, quantita: 1, quantitaArrivata: 1 },
    { arrivato: false, ordinato: true, ordineFornitoreId: "O", daMagazzino: false, quantita: 4, quantitaArrivata: 2 },
    { arrivato: false, ordinato: false, ordineFornitoreId: null, daMagazzino: true, quantita: 1, quantitaArrivata: 0 },
    { arrivato: false, ordinato: false, ordineFornitoreId: null, daMagazzino: false, quantita: 1, quantitaArrivata: 0 },
  ]);
  assert.deepEqual([r.tot, r.arrivate, r.parziali, r.inArrivo, r.daPrelevare, r.daOrdinare, r.percentuale, r.completo], [4, 1, 1, 1, 1, 1, 25, false]);
});

test("giacenza, costo medio ponderato, disponibilità, inventario", () => {
  const s = riepilogoMovimenti([{ quantita: 10, costoUnitario: 10, tipo: "CARICO" }, { quantita: 10, costoUnitario: 20, tipo: "CARICO" }, { quantita: -5, costoUnitario: 15, tipo: "SCARICO" }]);
  assert.deepEqual(s, { giacenza: 15, costoMedio: 15, valore: 225 });
  assert.equal(riepilogoMovimenti([], 7).costoMedio, 7);
  assert.deepEqual(disponibilita(10, 4, 8), { disponibile: 6, sottoScorta: true, daRiordinare: 10 });
  assert.deepEqual(disponibilita(10, 0, null), { disponibile: 10, sottoScorta: false, daRiordinare: 0 });
  assert.deepEqual(disponibilita(2, 5, null), { disponibile: -3, sottoScorta: true, daRiordinare: 3 });
  assert.equal(differenzaInventario(12, 10), -2);
  assert.equal(differenzaInventario(0.1 + 0.2, 0.3), 0);
});

test("abbinamento righe lette ↔ righe ordinate", () => {
  const cand = [
    { id: "a", codice: "PER-001", codiceFornitore: "SOM 1870", descrizione: "Motore tubolare Somfy Oximo 40 WT", residuo: 1 },
    { id: "b", codice: "PER-002", codiceFornitore: null, descrizione: "Telecomando Situo 5 io", residuo: 2 },
    { id: "c", codice: null, codiceFornitore: null, descrizione: "Profilo guida ferro zincato 6 metri", residuo: 4 },
  ];
  const esito = abbinaRighe([
    { codice: "som-1870", descrizione: "qualcosa" },
    { codice: null, descrizione: "GUIDA PROFILO FERRO ZINCATO mt 6" },
    { codice: "XYZ", descrizione: "Articolo sconosciuto" },
    { codice: "PER-002", descrizione: "Telecomando" },
  ], cand);
  assert.deepEqual(esito, ["a", "c", null, "b"]);
  assert.ok(somiglianza("Tenda a rullo", "Zanzariera") === 0);
  assert.equal(leggiQuantita("1.234,5"), 1234.5);
  assert.equal(leggiQuantita("2.5"), 2.5);
  assert.equal(leggiQuantita(""), null);
  assert.equal(giorniRitardo(new Date("2026-10-20T12:00:00Z"), new Date("2026-10-28T08:00:00Z")), 8);
});

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
<FatturaElettronicaHeader>
 <CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>SOMFY ITALIA S.R.L.</Denominazione></Anagrafica></DatiAnagrafici>
 <Sede><Indirizzo>Via Dante</Indirizzo><NumeroCivico>3</NumeroCivico><CAP>20100</CAP><Comune>Milano</Comune><Provincia>MI</Provincia></Sede></CedentePrestatore>
 <CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>10741080013</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>P&amp;C S.R.L.</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
</FatturaElettronicaHeader>
<FatturaElettronicaBody>
 <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>2026-10-15</Data><Numero>FV/123</Numero><ImportoTotaleDocumento>244.00</ImportoTotaleDocumento><Causale>Merce come da ordine</Causale></DatiGeneraliDocumento>
  <DatiOrdineAcquisto><IdDocumento>7/2026</IdDocumento></DatiOrdineAcquisto>
  <DatiDDT><NumeroDDT>4512</NumeroDDT><DataDDT>2026-10-10</DataDDT></DatiDDT></DatiGenerali>
 <DatiBeniServizi>
  <DettaglioLinee><NumeroLinea>1</NumeroLinea><CodiceArticolo><CodiceTipo>FORN</CodiceTipo><CodiceValore>SOM 1870</CodiceValore></CodiceArticolo><Descrizione>Motore Oximo 40 &#232; nuovo</Descrizione><Quantita>2.00</Quantita><UnitaMisura>PZ</UnitaMisura><PrezzoUnitario>75.00</PrezzoUnitario><PrezzoTotale>150.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>
  <DettaglioLinee><NumeroLinea>2</NumeroLinea><Descrizione>Trasporto</Descrizione><PrezzoUnitario>50.00</PrezzoUnitario><PrezzoTotale>50.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>
  <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>200.00</ImponibileImporto><Imposta>44.00</Imposta></DatiRiepilogo>
 </DatiBeniServizi>
 <DatiPagamento><CondizioniPagamento>TP01</CondizioniPagamento>
  <DettaglioPagamento><ModalitaPagamento>MP12</ModalitaPagamento><DataScadenzaPagamento>2026-11-30</DataScadenzaPagamento><ImportoPagamento>122.00</ImportoPagamento></DettaglioPagamento>
  <DettaglioPagamento><ModalitaPagamento>MP12</ModalitaPagamento><DataScadenzaPagamento>2026-12-31</DataScadenzaPagamento><ImportoPagamento>122.00</ImportoPagamento></DettaglioPagamento>
 </DatiPagamento>
</FatturaElettronicaBody>
</p:FatturaElettronica>`;

test("lettura fattura elettronica XML", () => {
  const [f] = leggiFatturaPA(XML);
  assert.equal(f.fornitore.denominazione, "SOMFY ITALIA S.R.L.");
  assert.equal(f.fornitore.partitaIva, "01234567890");
  assert.equal(f.fornitore.indirizzo, "Via Dante 3");
  assert.equal(f.cliente.partitaIva, "10741080013");
  assert.equal(divisioneDaCliente(f.cliente.partitaIva), "P&C");
  assert.deepEqual([f.numero, f.data, f.totale, f.imponibile, f.iva, f.tipoDocumento, f.notaCredito], ["FV/123", "2026-10-15", 244, 200, 44, "TD01", false]);
  assert.equal(f.righe.length, 2);
  assert.deepEqual(f.righe[0], { posizione: 1, codice: "SOM 1870", descrizione: "Motore Oximo 40 è nuovo", quantita: 2, um: "PZ", prezzoUnitario: 75, importo: 150, aliquotaIva: 22 });
  assert.equal(f.scadenze.length, 2);
  assert.deepEqual(f.scadenze[1], { data: "2026-12-31", importo: 122, modalita: "MP12" });
  assert.deepEqual(f.ddt, [{ numero: "4512", data: "2026-10-10" }]);
  assert.deepEqual(f.ordini, [{ numero: "7/2026", data: null }]);
  assert.equal(chiaveFattura(f.fornitore.partitaIva, "x", "TD01", "fv/123 ", "2026-10-15"), "01234567890|TD01|FV/123|2026");
});

test("p7m: DER grezzo, a blocchi e in base64; zip del cassetto fiscale", () => {
  const xml = Buffer.from(XML, "utf8");
  const der = Buffer.concat([Buffer.from([0x30, 0x82, 0x10, 0x00, 0x06, 0x09, 0x2a, 0x86]), xml, Buffer.from([0xa0, 0x82, 0x05, 0x00, 0x31, 0x00])]);
  assert.equal(leggiFatturaPA(estraiXml(der)!)[0].numero, "FV/123");
  // contenuto spezzato in OCTET STRING da 1000 byte
  const pezzi: Buffer[] = [];
  for (let i = 0; i < xml.length; i += 1000) { const p = xml.subarray(i, i + 1000); pezzi.push(Buffer.from([0x04, 0x82, p.length >> 8, p.length & 255]), p); }
  const blocchi = Buffer.concat([Buffer.from([0x30, 0x80, 0x24, 0x80]), ...pezzi, Buffer.from([0, 0])]);
  const letto = estraiXml(blocchi)!;
  assert.equal(leggiFatturaPA(letto)[0].righe.length, 2);
  const b64 = Buffer.from(der.toString("base64").replace(/(.{76})/g, "$1\n"), "latin1");
  assert.equal(leggiFatturaPA(estraiXml(b64)!)[0].totale, 244);
  const zip = scriviZip([{ nome: "IT01234567890_00001.xml.p7m", dati: der }, { nome: "IT01234567890_00002.xml", dati: Buffer.from(XML.replace("FV/123", "FV/124")) }, { nome: "leggimi.txt", dati: Buffer.from("x") }]);
  const tutti = leggiFileFatture("cassetto.zip", zip);
  assert.deepEqual(tutti.map((t) => t.fatture[0]?.numero), ["FV/123", "FV/124"]);
  assert.equal(leggiFileFatture("vuoto.xml", Buffer.from("<a>niente</a>"))[0].errore !== null, true);
});

test("più fatture nello stesso file e nota di credito", () => {
  const due = XML.replace("</FatturaElettronicaBody>", "</FatturaElettronicaBody><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD04</TipoDocumento><Data>2026-10-20</Data><Numero>NC/9</Numero></DatiGeneraliDocumento></DatiGenerali><DatiBeniServizi><DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Reso</Descrizione><PrezzoTotale>10.00</PrezzoTotale></DettaglioLinee><DatiRiepilogo><ImponibileImporto>10.00</ImponibileImporto><Imposta>2.20</Imposta></DatiRiepilogo></DatiBeniServizi></FatturaElettronicaBody>");
  const f = leggiFatturaPA(due);
  assert.equal(f.length, 2);
  assert.deepEqual([f[1].numero, f[1].notaCredito, f[1].totale], ["NC/9", true, 12.2]);
  assert.equal(trova(parseXml("<a><b><c>x</c></b></a>"), "b/c")?.testo, "x");
});

test("risposte AI normalizzate", () => {
  const f = normalizzaFatturaAi({ fornitore: { denominazione: "ACME", partitaIva: "IT 012 345" }, numero: "5", data: "15/10/2026", imponibile: "100,50", iva: 22.11, righe: [], scadenze: [{ data: "2026-11-30", importo: 122.61 }], tipo: "Nota di credito" });
  assert.deepEqual([f?.data, f?.imponibile, f?.totale, f?.fornitore.partitaIva, f?.notaCredito, f?.righe.length], ["2026-10-15", 100.5, 122.61, "012345", true, 1]);
  assert.equal(normalizzaFatturaAi({ numero: "5" }), null);
  const b = normalizzaBollaAi({ numero: "45", data: "2026-10-10", righe: [{ descrizione: "Motore", quantita: "2", codice: "M1" }, { descrizione: "" }] });
  assert.deepEqual([b?.numero, b?.righe.length, b?.righe[0].quantita], ["45", 1, 2]);
  assert.equal(normalizzaBollaAi({ righe: [] }), null);
});
