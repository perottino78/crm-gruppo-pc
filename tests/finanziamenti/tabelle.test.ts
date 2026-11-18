import { test } from "node:test";
import assert from "node:assert/strict";
import { calcolaFinanziamento } from "../../src/lib/finanziamenti/tabelle";

test("tasso zero 90gg, 10.000 € in 60 rate: come il simulatore", () => {
  const e = calcolaFinanziamento({ tabellaId: "ZERO_90", rate: 60, importoFinanziato: 10000 }, 12000);
  assert.ok(e.ok);
  if (!e.ok) return;
  assert.equal(e.rata, 166.67);
  assert.equal(e.totaleDovuto, 10120.2);
  assert.equal(e.costoPerNoi, 1573.01);
  assert.equal(e.nettoErogato, 8426.99);
  assert.equal(e.anticipoDiretto, 2000);
  assert.ok(e.taeg >= 0.4 && e.taeg <= 0.5, String(e.taeg)); // il foglio dà 0,45%
});
test("rifiuta importi e rate fuori tabella", () => {
  assert.equal(calcolaFinanziamento({ tabellaId: "ZERO_90", rate: 60, importoFinanziato: 500 }, 5000).ok, false);
  assert.equal(calcolaFinanziamento({ tabellaId: "PROMO_ZERO_10", rate: 12, importoFinanziato: 3000 }, 5000).ok, false);
  assert.equal(calcolaFinanziamento({ tabellaId: "ZERO_90", rate: 60, importoFinanziato: 9000 }, 5000).ok, false);
});
test("TAN 6,99%: rata di ammortamento e costo quasi nullo", () => {
  const e = calcolaFinanziamento({ tabellaId: "TAN699_90", rate: 60, importoFinanziato: 10000 }, 10000);
  assert.ok(e.ok);
  if (e.ok) { assert.ok(e.rata > 195 && e.rata < 205, String(e.rata)); assert.ok(e.costoPerNoi < 100, String(e.costoPerNoi)); }
});
