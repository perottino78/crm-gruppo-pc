import { test } from "node:test";
import assert from "node:assert/strict";
import { statoRata, tipoDocumento, marchioDa, notaRata } from "../../src/lib/amministrazione/bconsole";

test("stato delle rate di BConsole", () => {
  for (const s of ["Saldata", "Saldata con CC", "Chiusa", "Compensata", "Compensata con crediti", "Cassa Iva Estero"]) assert.equal(statoRata(s), "PAGATA", s);
  assert.equal(statoRata("Rit. Fis Compensazione"), "RITENUTA");
  assert.equal(statoRata("Stornata"), "STORNATA");
  assert.equal(statoRata("Saldata parzialmente"), "PARZIALE");
  for (const s of ["Aperta", "Insoluta", "Anticipata", "Scaduta"]) assert.equal(statoRata(s), "APERTA", s);
});

test("tipo documento e marchio", () => {
  assert.equal(tipoDocumento({ tipo: "ACQUISTO", sigla: "FP", totale: 100 }), "PROFORMA");
  assert.equal(tipoDocumento({ tipo: "ACQUISTO", sigla: "NAC", totale: -50 }), "TD04");
  assert.equal(tipoDocumento({ tipo: "ACQUISTO", sigla: "FS", totale: 100 }), "TD01");
  assert.equal(tipoDocumento({ tipo: "VENDITA", sigla: "FAC", totale: 100 }), "TD02");
  assert.equal(tipoDocumento({ tipo: "VENDITA", sigla: "FT", totale: -12670 }), "TD04");
  assert.equal(marchioDa("Pura Fonte"), "Purafonte");
  assert.equal(marchioDa("Solaris"), "Solaris");
  assert.equal(marchioDa(null), null);
});

test("nota della rata", () => {
  assert.equal(notaRata({ bcId: "1", descrizione: "", scadenza: null, importo: 10, stato: "Saldata", pagataIl: "2026-07-02", metodo: "bonifico", banca: "Banca BPER" }), "Saldata in BConsole il 02/07/2026 (bonifico · Banca BPER) [Saldata]");
  assert.match(notaRata({ bcId: "1", descrizione: "", scadenza: null, importo: 10, stato: "Saldata parzialmente" }), /verificare/);
});
