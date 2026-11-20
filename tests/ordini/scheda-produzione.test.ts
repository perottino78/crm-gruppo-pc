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

import { raggruppaCampi, MODELLO_LIPARI, MODELLI_PRONTI } from "../../src/lib/ordini/scheda-produzione";
test("campi a tabella: un gruppo per tabella, righe e colonne in ordine", () => {
  const g = raggruppaCampi(["tab_dimensioni_1_L", "tab_dimensioni_1_S", "tab_dimensioni_2_L", "tab_dimensioni_2_S", "note_produzione"]);
  assert.deepEqual(g.singoli, ["note_produzione"]);
  assert.deepEqual(g.tabelle, [{ gruppo: "dimensioni", righe: [1, 2], colonne: ["L", "S"] }]);
});
test("modello NEW LIPARI: gruppi da 3 righe (una per pergola) e note", () => {
  const g = raggruppaCampi(campiDaCompilare(MODELLO_LIPARI));
  assert.deepEqual(g.tabelle.map((x) => x.gruppo), ["qta", "installazione", "dimensioni", "piantoni", "colore", "motore", "telo", "optional", "traversi", "illuminazione"]);
  assert.ok(g.tabelle.every((t) => t.righe.length === 3));
  assert.deepEqual(g.tabelle.find((t) => t.gruppo === "piantoni")?.colonne, ["A", "B", "C", "D", "A1", "B1", "C1", "D1"]);
  assert.ok(g.singoli.includes("note_produzione"));
  assert.ok(MODELLI_PRONTI.length >= 2);
});

import { descriviCampi, MODELLO_SEEGLASS } from "../../src/lib/ordini/scheda-produzione";
test("scelte a spunta: singola e multipla, con caselle ☒ ☐ nella scheda", () => {
  const h = "{{sc:vie|3 vie|4 vie|5 vie}} {{multi:chiusura|Auto-blocco|Serratura CD-6|Pomo}} {{nota}}";
  const d = descriviCampi(h);
  assert.deepEqual(d.map((x) => [x.nome, x.tipo]), [["vie", "scelta"], ["chiusura", "multi"], ["nota", "testo"]]);
  assert.deepEqual(d[1].opzioni, ["Auto-blocco", "Serratura CD-6", "Pomo"]);
  const out = compilaScheda(h, { vie: "4 vie", chiusura: "Auto-blocco|Pomo", nota: "ok" }, "");
  assert.ok(out.includes("&#9746; 4 vie") && out.includes("&#9744; 3 vie") && out.includes("&#9746; Auto-blocco") && out.includes("&#9744; Serratura CD-6") && out.includes("&#9746; Pomo"));
});
test("modulo SEEGLASS RUN: scelte per vie, vetro, colori, chiusure e trasporto", () => {
  const d = descriviCampi(MODELLO_SEEGLASS);
  const per = new Map(d.map((x) => [x.nome, x]));
  assert.deepEqual(per.get("n_vie")?.opzioni, ["3 vie", "4 vie", "5 vie", "6 vie"]);
  assert.equal(per.get("chiusura")?.tipo, "multi");
  assert.ok(per.get("trasporto")?.opzioni.includes("Trasporto C3 Systems"));
  assert.equal(per.get("larghezza_mm")?.tipo, "testo");
  assert.equal(MODELLI_PRONTI.length, 4); // standard, NEW LIPARI, legno piallato, SEEGLASS
});
