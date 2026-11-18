import { test } from "node:test";
import assert from "node:assert/strict";
import { campiDaCompilare, compilaScheda, tabellaRighe, MODELLO_PREDEFINITO } from "../../src/lib/ordini/scheda-produzione";

test("i campi da compilare sono i segnaposto che il CRM non riempie da solo", () => {
  assert.deepEqual(campiDaCompilare("{{ordine}} {{misure_definitive}} {{ cliente }} {{note_produzione}} {{misure_definitive}}"), ["misure_definitive", "note_produzione"]);
  assert.deepEqual(campiDaCompilare(MODELLO_PREDEFINITO), ["misure_definitive", "note_produzione"]);
});
test("compilazione: valori protetti dall'HTML, a capo conservati, righe già in HTML", () => {
  const h = compilaScheda("<p>{{misure}}</p>{{righe}}", { misure: "L 1200 × H <1400>\nsecondo foglio" }, "<table></table>");
  assert.equal(h, "<p>L 1200 × H &lt;1400&gt;<br>secondo foglio</p><table></table>");
});
test("tabella righe senza prezzi", () => {
  const t = tabellaRighe([{ descrizione: "Finestra 2 ante", quantita: 2, um: "pz", codice: "F2A" }]);
  assert.ok(t.includes("Finestra 2 ante") && t.includes("2 pz") && !t.includes("€"));
});
