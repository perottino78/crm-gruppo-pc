import { test } from "node:test";
import assert from "node:assert/strict";
import { calcolaFinanziamento, normalizzaTabella } from "../../src/lib/finanziamenti/tabelle";

// Valori ricalcolati dal foglio «SIMULATORE_.xlsx» con LibreOffice (stessi importi, tabelle e durate).
const cc = (tabellaId: string, rate: number, importo: number) => {
  const e = calcolaFinanziamento({ tabellaId, rate, pagaSubito: 0 }, importo);
  assert.ok(e.ok);
  return e as Extract<typeof e, { ok: true }>;
};

test("tasso zero 90gg, 10.000 € in 60 rate", () => {
  const e = calcolaFinanziamento({ tabellaId: "ZERO_90", rate: 60, pagaSubito: 2000 }, 12000);
  assert.ok(e.ok);
  if (!e.ok) return;
  assert.equal(e.rata, 166.67);
  assert.equal(e.totaleDovuto, 10120.2);
  assert.equal(e.costoPerNoi, 1573.01);
  assert.equal(e.nettoErogato, 8426.99);
  assert.equal(e.anticipoDiretto, 2000);
  assert.ok(e.taeg >= 0.4 && e.taeg <= 0.5, String(e.taeg)); // il foglio dà 0,45%
});
test("tasso zero 90gg, 6.157,77 € in 60 rate", () => {
  const e = cc("ZERO_90", 60, 6157.77);
  assert.equal(e.rata, 102.63);
  assert.equal(e.costoPerNoi, 968.7);
  assert.equal(e.nettoErogato, 5189.07);
});
test("promo zero 30gg, 5.000 € in 10 rate", () => {
  const e = cc("PROMO_ZERO_10", 10, 5000);
  assert.equal(e.rata, 500);
  assert.equal(e.costoPerNoi, 145.79);
  assert.equal(e.totaleDovuto, 5016);
});
test("TAN 6,99%: rata all'euro, interessi di differimento, nessun costo per noi", () => {
  const e = cc("TAN699_90", 24, 20000);
  assert.equal(e.rata, 905.81); // 896 + 9,81 di differimento
  assert.equal(e.totaleDovuto, 21797.44);
  assert.equal(e.costoPerNoi, 0);
  assert.equal(e.nettoErogato, 20000);
  assert.ok(Math.abs(e.taeg - 7.47) < 0.05, String(e.taeg));
  const f = cc("TAN699_90", 60, 6157.77);
  assert.equal(f.costoPerNoi, 0); // era 59,30: il foglio non dà contributo se il TAN non è sotto il rendimento
});
test("rifiuta importi e rate fuori tabella", () => {
  assert.equal(calcolaFinanziamento({ tabellaId: "ZERO_90", rate: 60, pagaSubito: 4500 }, 5000).ok, false);
  assert.equal(calcolaFinanziamento({ tabellaId: "PROMO_ZERO_10", rate: 12, pagaSubito: 0 }, 5000).ok, false);
  assert.equal(calcolaFinanziamento({ tabellaId: "ZERO_90", rate: 60, pagaSubito: 6000 }, 5000).ok, false);
});
test("tabella scritta a mano: validazione", () => {
  const ok = normalizzaTabella({ nome: "Prova", importoMin: "1000", importoMax: "20000", rateDa: "12", rateA: "60", giorniPrimaRata: "90", tan: "5,5", tassoRendimento: "6,5" });
  assert.ok(typeof ok !== "string" && ok.tan === 5.5 && ok.id.length > 0);
  assert.equal(typeof normalizzaTabella({ nome: "", importoMin: 1, importoMax: 2, rateDa: 1, rateA: 2, giorniPrimaRata: 90, tan: 0, tassoRendimento: 0 }), "string");
  assert.equal(typeof normalizzaTabella({ nome: "x", importoMin: 5000, importoMax: 1000, rateDa: 1, rateA: 2, giorniPrimaRata: 90, tan: 0, tassoRendimento: 0 }), "string");
  assert.equal(typeof normalizzaTabella({ nome: "x", importoMin: 1, importoMax: 2, rateDa: 1, rateA: 2, giorniPrimaRata: 45, tan: 0, tassoRendimento: 0 }), "string");
});
