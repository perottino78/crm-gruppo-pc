import { test } from "node:test";
import assert from "node:assert/strict";
import { nomeLeggibile, coloreLeggibile, vociRiepilogo } from "../../src/lib/preventivi/riepilogo-stampa";

test("nomi dei gruppi leggibili", () => {
  assert.equal(nomeLeggibile("SERRAMENTI PVC"), "Serramenti PVC");
  assert.equal(nomeLeggibile("PORTE_INTERNE"), "Porte interne");
});

test("colori segnaposto nascosti", () => {
  assert.equal(coloreLeggibile("STANDARD"), null);
  assert.equal(coloreLeggibile("—"), null);
  assert.equal(coloreLeggibile("RAL 9010 bianco"), "RAL 9010 bianco");
});

test("elenco puntato nell'ordine tipo, colore, misure, optional", () => {
  const v = vociRiepilogo({ gruppo: "PERGOLE", sottogruppo: "Tempra (pannelli coibentati)", colore: "Bianco", misura: "4000 × 3000 mm", optionali: ["Strip LED 5 m (1×)", ""] });
  assert.deepEqual(v.map((x) => x.etichetta), ["Tipo", "Colore", "Misure", "Optional"]);
  assert.equal(v[0].valore, "Pergole — Tempra (pannelli coibentati)");
  assert.equal(v[3].valore, "Strip LED 5 m (1×)");
  assert.deepEqual(vociRiepilogo({ colore: "std" }), []);
});
