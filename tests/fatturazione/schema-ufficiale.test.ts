// Validazione degli XML prodotti dal CRM con lo schema ufficiale dell'Agenzia delle Entrate (FatturaPA 1.2.2, scaricato da fatturapa.gov.it).
// Serve `xmllint` (pacchetto libxml2-utils); se manca la prova viene saltata.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { xmlFatturaPA, type DatiXml } from "../../src/lib/fatturazione/xml";

const XSD = join(__dirname, "schema", "Schema_FatturaPA_v1.2.2.xsd");
let disponibile = true;
try { execFileSync("xmllint", ["--version"], { stdio: "ignore" }); } catch { disponibile = false; }

function valida(xml: string): string | null {
  const f = join(mkdtempSync(join(tmpdir(), "fe-")), "f.xml");
  writeFileSync(f, xml);
  try { execFileSync("xmllint", ["--noout", "--schema", XSD, f], { stdio: "pipe" }); return null; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); }
}

const data = new Date("2026-11-09T12:00:00Z");
const privato = { denominazione: "ROSSI MARIO", nome: "Mario", cognome: "Rossi", persona: true, codiceFiscale: "RSSMRA80A01L219M", indirizzo: "Via Roma 1", cap: "10100", comune: "Torino", provincia: "TO", pec: "mario@pec.it" };
const societa = { denominazione: "ACME SRL", persona: false, partitaIva: "01234567897", indirizzo: "Via Po 2", cap: "10121", comune: "Torino", provincia: "TO", codiceDestinatario: "ABC1234" };
const pag = { metodo: "BONIFICO_VISTA", iban: "IT60X0542811101000000123456", istituto: "Banca Intesa Sanpaolo", rate: [{ data, importo: 1220 }] };

const casi: [string, DatiXml][] = [
  ["acconto a privato", { progressivoInvio: "2026FE519", tipo: "ACCONTO", numero: "519/FE/2026", data, cliente: privato, righe: [{ descrizione: "Acconto per fornitura serramenti", quantita: 1, prezzo: 1000, aliquota: 10 }], causale: "FATTURA ACCONTO", pagamento: { ...pag, rate: [{ data, importo: 1100 }] } }],
  ["saldo con IVA mista e acconto dedotto", { progressivoInvio: "2026FE520", tipo: "SALDO", numero: "520/FE/2026", data, cliente: privato, righe: [{ descrizione: "Finestre", quantita: 3, prezzo: 333.333333, aliquota: 10 }, { descrizione: "Posa", quantita: 1, prezzo: 500, aliquota: 22 }, { descrizione: "A dedurre acconto", quantita: 1, prezzo: -1000, aliquota: 10 }], pagamento: pag }],
  ["fattura a società con sconto e bollo", { progressivoInvio: "2026FE521", tipo: "FATTURA", numero: "521/FE/2026", data, cliente: societa, righe: [{ descrizione: "Lavori esenti", quantita: 1, prezzo: 100, aliquota: 0, natura: "N4" }, { descrizione: "Merce", quantita: 2, prezzo: 50, sconto: 10, aliquota: 22, um: "nr", codice: "M1" }], bollo: true, addebitoBollo: true }],
  ["differita con DDT", { progressivoInvio: "2026FE522", tipo: "DIFFERITA", numero: "522/FE/2026", data, cliente: societa, righe: [{ descrizione: "Merce", quantita: 1, prezzo: 100, aliquota: 22 }], ddt: [{ numero: "551/2026", data }] }],
  ["nota di credito", { progressivoInvio: "2026FE523", tipo: "NOTA_CREDITO", numero: "523/FE/2026", data, cliente: societa, righe: [{ descrizione: "Storno", quantita: 1, prezzo: 100, aliquota: 22 }], fatturaCollegata: { numero: "522/FE/2026", data } }],
  ["ritenuta d'acconto 23% su 20%", { progressivoInvio: "2026FE524", tipo: "FATTURA", numero: "524/FE/2026", data, cliente: societa, righe: [{ descrizione: "Provvigioni", quantita: 1, prezzo: 67.5, aliquota: 0, natura: "N4" }], ritenutaAliquota: 23, ritenutaBase: 20, bollo: true, pagamento: { ...pag, rate: [{ data, importo: 64.39 }] } }],
  ["cliente estero", { progressivoInvio: "2026FE525", tipo: "FATTURA", numero: "525/FE/2026", data, cliente: { denominazione: "MUELLER GMBH", persona: false, partitaIva: "DE123456789", nazione: "DE", indirizzo: "Hauptstrasse 1", cap: "10115", comune: "Berlin" }, righe: [{ descrizione: "Merce", quantita: 1, prezzo: 100, aliquota: 0, natura: "N3.2" }] }],
];

for (const [nome, d] of casi) {
  test(`schema ufficiale FatturaPA 1.2.2: ${nome}`, { skip: !disponibile && "xmllint non installato" }, () => {
    const errore = valida(xmlFatturaPA(d));
    assert.equal(errore, null, errore ?? "");
  });
}
