import { test } from "node:test";
import assert from "node:assert/strict";
import { importoRiga, riepilogoIva, totali, serveBollo, rateDaMetodo, numeroFattura, numeroProva, progressivoDa, prossimoNumero, numeroDdt, statoDdtDaRighe, propostaDaCommessa } from "../../src/lib/fatturazione/calcoli";
import { xmlFatturaPA, nomeFileXml } from "../../src/lib/fatturazione/xml";
import { leggiFatturaPA } from "../../src/lib/fatture/fatturapa";

test("righe, sconto e riepilogo IVA per aliquota", () => {
  assert.equal(importoRiga({ quantita: 5, prezzo: 119.15, aliquota: 10 }), 595.75);
  assert.equal(importoRiga({ quantita: 2, prezzo: 100, sconto: 10, aliquota: 22 }), 180);
  const r = riepilogoIva([
    { quantita: 1, prezzo: 1000, aliquota: 10 }, { quantita: 1, prezzo: 500, aliquota: 22 }, { quantita: 1, prezzo: 333.33, aliquota: 10 },
    { quantita: 1, prezzo: 200, aliquota: 0, natura: "N6.3" },
  ]);
  assert.deepEqual(r.map((v) => [v.aliquota, v.natura, v.imponibile, v.imposta]), [[22, null, 500, 110], [10, null, 1333.33, 133.33], [0, "N6.3", 200, 0]]);
  assert.match(r[2].norma!, /17/);
});

test("totali e bollo", () => {
  const righe = [{ quantita: 1, prezzo: 3503.64, aliquota: 10 }];
  assert.deepEqual({ ...totali(righe), riepilogo: undefined }, { imponibile: 3503.64, iva: 350.36, bollo: 0, totale: 3854, riepilogo: undefined });
  const esenti = [{ quantita: 1, prezzo: 100, aliquota: 0, natura: "N4" }];
  assert.equal(serveBollo(esenti), true);
  assert.equal(serveBollo([{ quantita: 1, prezzo: 77, aliquota: 0, natura: "N4" }]), false);
  assert.equal(serveBollo([{ quantita: 1, prezzo: 500, aliquota: 0, natura: "N6.3" }]), false); // reverse charge: niente bollo
  assert.equal(totali(esenti, { bollo: true, addebitoBollo: true }).totale, 102);
  assert.equal(totali(esenti, { bollo: true }).totale, 100);
});

test("rate dal metodo di pagamento", () => {
  const d = new Date("2026-11-09T12:00:00Z");
  assert.deepEqual(rateDaMetodo("BONIFICO_VISTA", d, 100).map((r) => [r.data.toISOString().slice(0, 10), r.importo]), [["2026-11-09", 100]]);
  assert.deepEqual(rateDaMetodo("RIBA_306090FM", d, 100).map((r) => [r.data.toISOString().slice(0, 10), r.importo]), [["2026-12-31", 33.33], ["2027-01-31", 33.33], ["2027-02-28", 33.34]]);
});

test("numerazione come BConsole", () => {
  assert.equal(numeroFattura(519, "PC", 2026), "519/FE/2026");
  assert.equal(numeroFattura(3, "FO", 2026), "3/FO/2026");
  assert.equal(numeroProva(1, "PC", 2026), "PROVA 1/FE/2026");
  assert.equal(progressivoDa("518/FE/2026", "PC", 2026), 518);
  assert.equal(progressivoDa("518/FE/2025", "PC", 2026), null);
  assert.equal(progressivoDa("12/FO/2026", "PC", 2026), null);
  assert.equal(progressivoDa("PROVA 5/FE/2026", "PC", 2026), null);
  assert.equal(prossimoNumero([518, 3, 517]), 519);
  assert.equal(prossimoNumero([], 600), 601);
  assert.equal(prossimoNumero([]), 1);
  assert.equal(numeroDdt({ numero: 552, anno: 2026 }), "552/2026");
  assert.equal(numeroDdt({ numero: 2, anno: 2026, prova: true }), "PROVA 2/2026");
  assert.equal(numeroDdt({ numero: null, anno: 2026 }), "bozza");
});

test("stato del DDT dalle righe fatturate", () => {
  assert.equal(statoDdtDaRighe("DA_FATTURARE", [{ fatturata: true }, { fatturata: false }]), "PARZ_FATTURATO");
  assert.equal(statoDdtDaRighe("PARZ_FATTURATO", [{ fatturata: true }, { fatturata: true }]), "FATTURATO");
  assert.equal(statoDdtDaRighe("FATTURATO", [{ fatturata: false }]), "DA_FATTURARE");
  assert.equal(statoDdtDaRighe("CHIUSO", [{ fatturata: false }]), "CHIUSO");
});

test("proposta acconto e saldo dalla commessa", () => {
  const c = { totaleVendita: 11000, totaleImponibile: 10000, accontoImporto: 5500 };
  assert.deepEqual(propostaDaCommessa("ACCONTO", c, 0, 10), { descrizione: "Acconto", imponibile: 5000 });
  assert.deepEqual(propostaDaCommessa("SALDO", c, 5000, 10), { descrizione: "Saldo", imponibile: 5000 });
});

test("XML FatturaPA: si rilegge con il lettore delle fatture", () => {
  const xml = xmlFatturaPA({
    progressivoInvio: "FE519", tipo: "ACCONTO", numero: "519/FE/2026", data: new Date("2026-11-09T12:00:00Z"),
    cliente: { denominazione: "ROSSI MARIO", nome: "Mario", cognome: "Rossi", persona: true, codiceFiscale: "rssmra80a01l219x", indirizzo: "Via Roma 1", cap: "10100", comune: "Torino", provincia: "to", codiceDestinatario: null, pec: "mario@pec.it" },
    righe: [{ descrizione: "Acconto per fornitura serramenti <PVC> & posa", quantita: 1, prezzo: 3503.64, aliquota: 10 }, { descrizione: "Smaltimento", quantita: 2, prezzo: 50, sconto: 10, aliquota: 22, codice: "SMALT", um: "nr" }],
    causale: "Fattura di acconto — contratto del 1/11/2026",
    pagamento: { metodo: "BONIFICO_VISTA", iban: "IT60 X054 2811 1010 0000 0123 456", istituto: "Banca Intesa Sanpaolo", rate: [{ data: new Date("2026-11-09T12:00:00Z"), importo: 3963.8 }] },
  });
  assert.match(xml, /<TipoDocumento>TD02<\/TipoDocumento>/);
  assert.match(xml, /<CodiceDestinatario>0000000<\/CodiceDestinatario><PECDestinatario>mario@pec.it/);
  assert.match(xml, /<Nome>Mario<\/Nome><Cognome>Rossi<\/Cognome>/);
  assert.match(xml, /<CodiceFiscale>RSSMRA80A01L219X<\/CodiceFiscale>/);
  assert.match(xml, /&lt;PVC&gt; &amp; posa/);
  assert.match(xml, /<IBAN>IT60X0542811101000000123456<\/IBAN>/);
  assert.match(xml, /<Provincia>TO<\/Provincia>/);
  const [f] = leggiFatturaPA(xml);
  assert.equal(f.numero, "519/FE/2026");
  assert.equal(f.data, "2026-11-09");
  assert.equal(f.fornitore.partitaIva, "10741080013");
  assert.equal(f.cliente.denominazione, "Mario Rossi");
  assert.equal(f.imponibile, 3593.64);
  assert.equal(f.iva, 350.36 + 19.8);
  assert.equal(f.totale, 3963.8);
  assert.equal(f.righe.length, 2);
  assert.equal(f.scadenze[0].importo, 3963.8);
  assert.equal(nomeFileXml("FE519"), "IT10741080013_FE519.xml");
});

test("XML: differita con DDT, nota di credito collegata, bollo e azienda", () => {
  const xml = xmlFatturaPA({
    progressivoInvio: "2", tipo: "DIFFERITA", numero: "1/FE/2026", data: new Date("2026-11-30T12:00:00Z"),
    cliente: { denominazione: "ACME SRL", persona: false, partitaIva: "IT01234567890", codiceDestinatario: "abc1234" },
    righe: [{ descrizione: "Lavori esenti", quantita: 1, prezzo: 100, aliquota: 0, natura: "N4" }],
    bollo: true, addebitoBollo: true, ddt: [{ numero: "551/2026", data: new Date("2026-11-09T12:00:00Z") }],
  });
  assert.match(xml, /<TipoDocumento>TD24<\/TipoDocumento>/);
  assert.match(xml, /<CodiceDestinatario>ABC1234<\/CodiceDestinatario>/);
  assert.match(xml, /<IdCodice>01234567890<\/IdCodice><\/IdFiscaleIVA><Anagrafica><Denominazione>ACME SRL/);
  assert.match(xml, /<DatiBollo><BolloVirtuale>SI<\/BolloVirtuale><ImportoBollo>2.00<\/ImportoBollo><\/DatiBollo><ImportoTotaleDocumento>102.00/);
  assert.match(xml, /<DatiDDT><NumeroDDT>551\/2026<\/NumeroDDT><DataDDT>2026-11-09<\/DataDDT><\/DatiDDT>/);
  assert.match(xml, /<Natura>N4<\/Natura><ImponibileImporto>100.00<\/ImponibileImporto><Imposta>0.00<\/Imposta><RiferimentoNormativo>/);
  const nc = xmlFatturaPA({
    progressivoInvio: "3", tipo: "NOTA_CREDITO", numero: "2/FE/2026", data: new Date("2026-12-01T12:00:00Z"),
    cliente: { denominazione: "ACME SRL", persona: false, partitaIva: "01234567890" },
    righe: [{ descrizione: "Storno", quantita: 1, prezzo: 100, aliquota: 22 }], fatturaCollegata: { numero: "1/FE/2026", data: new Date("2026-11-30T12:00:00Z") },
  });
  assert.match(nc, /<TipoDocumento>TD04<\/TipoDocumento>/);
  assert.match(nc, /<DatiFattureCollegate><IdDocumento>1\/FE\/2026<\/IdDocumento>/);
  assert.equal(leggiFatturaPA(nc)[0].notaCredito, true);
  assert.throws(() => xmlFatturaPA({ progressivoInvio: "4", tipo: "PROFORMA", numero: "x", data: new Date(), cliente: { denominazione: "x", persona: false }, righe: [] }));
});
