import { test } from "node:test";
import assert from "node:assert/strict";
import { totaliDistinta, creaCiclo } from "../../src/lib/articoli/distinta";

test("kit: costo e prezzo sono la somma dei pezzi per la loro quantità", () => {
  const t = totaliDistinta([{ quantita: 2, costo: 10, vendita: 25 }, { quantita: 1, costo: 3.5, vendita: 9.9 }]);
  assert.equal(t.costo, 23.5);
  assert.equal(t.vendita, 59.9);
  assert.equal(t.senzaCosto, 0);
});
test("kit: i pezzi senza costo o prezzo si segnalano e non falsano il totale", () => {
  const t = totaliDistinta([{ quantita: 1, costo: null, vendita: 12 }, { quantita: 3, costo: 2, vendita: null }]);
  assert.equal(t.costo, 6);
  assert.equal(t.vendita, 12);
  assert.equal(t.senzaCosto, 1);
  assert.equal(t.senzaPrezzo, 1);
});
test("kit vuoto: nessun totale", () => { assert.equal(totaliDistinta([]).costo, null); });
test("un kit non può contenere se stesso nemmeno attraverso un altro kit", () => {
  const figli: Record<string, string[]> = { B: ["C"], C: ["A"], D: [] };
  assert.equal(creaCiclo("A", "A", () => []), true);
  assert.equal(creaCiclo("A", "B", (x) => figli[x] ?? []), true);
  assert.equal(creaCiclo("A", "D", (x) => figli[x] ?? []), false);
});
