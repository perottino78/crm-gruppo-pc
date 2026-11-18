import test from "node:test";
import assert from "node:assert/strict";
import { leggiCointestatario, cointestatarioDa, mancaCointestato, testoCointestato, causaleConCointestato } from "../../src/lib/fatturazione/cointestato";

const modulo = (o: Record<string, string>) => (k: string) => o[k] ?? null;

test("senza spunta o senza dati non c'è cointestatario", () => {
  assert.equal(leggiCointestatario(modulo({ cointest_nome: "Anna" }), false), null);
  assert.equal(leggiCointestatario(modulo({}), true), null);
});

test("dati letti dal modulo, codice fiscale in maiuscolo", () => {
  const c = leggiCointestatario(modulo({ cointest_nome: " Anna ", cointest_cognome: "Verdi", cointest_codiceFiscale: "vrdnna80a41l219x", cointest_comune: "Torino", cointest_provincia: "to", cointest_quota: "50%" }), true)!;
  assert.equal(c.nome, "Anna");
  assert.equal(c.codiceFiscale, "VRDNNA80A41L219X");
  assert.equal(c.provincia, "TO");
  assert.deepEqual(mancaCointestato(c), []);
});

test("controlli: servono nome, cognome e codice fiscale valido", () => {
  assert.deepEqual(mancaCointestato(null), []);
  assert.equal(mancaCointestato({ nome: "A", cognome: "", codiceFiscale: "" }).length, 2);
  assert.match(mancaCointestato({ nome: "A", cognome: "B", codiceFiscale: "ABC" })[0], /non valido/);
});

test("testo in causale e JSON salvato", () => {
  const c = { nome: "Anna", cognome: "Verdi", codiceFiscale: "VRDNNA80A41L219X", indirizzo: "Via Roma 1", cap: "10100", comune: "Torino", provincia: "TO", quota: "50%" };
  assert.equal(testoCointestato(c), "Fattura cointestata a: Anna Verdi, C.F. VRDNNA80A41L219X, Via Roma 1, 10100 Torino (TO), quota 50%");
  assert.equal(causaleConCointestato("Saldo lavori", c), `Saldo lavori — ${testoCointestato(c)}`);
  assert.equal(causaleConCointestato("Saldo lavori", null), "Saldo lavori");
  assert.equal(causaleConCointestato(null, null), null);
  assert.deepEqual(cointestatarioDa(JSON.parse(JSON.stringify(c))), { ...c, partitaIva: undefined });
  assert.equal(cointestatarioDa(null), null);
});
