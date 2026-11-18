import { test } from "node:test";
import assert from "node:assert/strict";
import { rataMensile, contributoENetto, taeg } from "../../src/lib/finanziamenti/calcoli";

const d = { importo: 10000, tanPercentuale: 0, rate: 60, mesiPrimaRata: 3, speseIncassoRata: 2 };

test("rata a tasso zero su 60 mesi", () => {
  assert.equal(rataMensile(10000, 0, 60), 166.67);
});
test("contributo e netto erogato come il simulatore (tabella 6,99%)", () => {
  const r = contributoENetto(d, 6.5);
  assert.equal(r.contributo, 1573.01);
  assert.equal(r.nettoErogato, 8426.99);
});
test("TAEG vicino a quello del foglio", () => {
  const t = taeg(d, 166.67);
  assert.ok(t > 0 && t < 5, String(t));
});
