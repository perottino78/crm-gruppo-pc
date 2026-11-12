import { test } from "node:test";
import assert from "node:assert/strict";
import { assegnaGruppi, divisione, numeroGruppi } from "../../src/lib/campagne/abtest";

const ids = (n: number, p = "c") => Array.from({ length: n }, (_, i) => `${p}${i}`);
const conta = (m: Map<string, number>, g: number) => { const c = Array(g).fill(0); for (const v of m.values()) c[v]++; return c; };

test("divisione equa: 10 contatti in 3 gruppi → 4/3/3", () => {
  const c = conta(assegnaGruppi("k", ids(10), [0, 0, 0]), 3);
  assert.equal(c.reduce((a, b) => a + b, 0), 10);
  assert.ok(Math.max(...c) - Math.min(...c) <= 1);
  assert.deepEqual(divisione(10, 3), [4, 3, 3]);
  assert.deepEqual(divisione(7, 2), [4, 3]);
});

test("sempre uguale a parità di dati e senza doppioni", () => {
  assert.deepEqual([...assegnaGruppi("k", ids(20), [0, 0])], [...assegnaGruppi("k", ids(20), [0, 0])]);
  assert.equal(assegnaGruppi("k", ["a", "a", "b"], [0, 0]).size, 2);
});

test("rinvio ai nuovi: si riequilibra sui gruppi già pieni", () => {
  const c = conta(assegnaGruppi("k", ids(6, "n"), [10, 6]), 2);
  assert.deepEqual(c, [1, 5]);
});

test("numero di gruppi fra 2 e 10", () => {
  assert.equal(numeroGruppi("1"), 2);
  assert.equal(numeroGruppi("15"), 10);
  assert.equal(numeroGruppi("abc"), 2);
  assert.equal(numeroGruppi(4), 4);
});
