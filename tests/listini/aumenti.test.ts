import { test } from "node:test";
import assert from "node:assert/strict";
import { leggiPercentuale, arrotonda, aumenta, optionalDaAumentare, listiniOptional, chiaveListino, leggiChiaveListino, testoPercentuale } from "../../src/lib/listini/aumenti";

test("percentuale scritta come capita", () => {
  assert.equal(leggiPercentuale("3,5"), 3.5);
  assert.equal(leggiPercentuale("+3.5%"), 3.5);
  assert.equal(leggiPercentuale(" -2 "), -2);
  assert.equal(leggiPercentuale("0"), null);
  assert.equal(leggiPercentuale("abc"), null);
  assert.equal(leggiPercentuale("80"), null); // quasi certamente un errore di battitura
  assert.equal(leggiPercentuale(""), null);
});

test("aumento e arrotondamenti", () => {
  assert.equal(aumenta(100, 3.5), 103.5);
  assert.equal(aumenta(287.4, 3.5), 297.46);
  assert.equal(aumenta(287.4, 3.5, "MEZZO_EURO"), 297.5);
  assert.equal(aumenta(287.4, 3.5, "EURO"), 297);
  assert.equal(aumenta(100, -2), 98);
  assert.equal(aumenta(0, 10), 0);
  assert.equal(arrotonda(0.1 + 0.2), 0.3);
});

test("optional del listino: in percentuale no, generali del marchio no", () => {
  assert.equal(optionalDaAumentare({ tipoPrezzo: "FISSO" }), true);
  assert.equal(optionalDaAumentare({ tipoPrezzo: "PERCENTUALE" }), false);
  const lt = (t: string) => (t.startsWith("FRANGISOLE_") ? "FRANGISOLE_VERT" : null);
  assert.deepEqual(listiniOptional(["FRANGISOLE_A", "BRILLANTE"], lt).sort(), ["BRILLANTE", "FRANGISOLE_A", "FRANGISOLE_VERT"]);
});

test("chiave del listino e testo", () => {
  assert.deepEqual(leggiChiaveListino(chiaveListino("b1", "ZIP|X")), { brandId: "b1", tipologia: "ZIP|X" });
  assert.equal(leggiChiaveListino("senza"), null);
  assert.equal(testoPercentuale(3.5), "+3,5%");
  assert.equal(testoPercentuale(-2), "-2%");
});
