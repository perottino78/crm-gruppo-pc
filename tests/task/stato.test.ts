import { test } from "node:test";
import assert from "node:assert/strict";
import { statoMostrato } from "../../src/lib/task/categorie";
import { coinvolti } from "../../src/lib/task/permessi";

const ora = new Date("2026-11-18T10:00:00Z");
test("stato mostrato: fatto, scaduta, in corso, da fare", () => {
  assert.equal(statoMostrato({ statoTask: "DA_FARE", completata: true, scadenza: null }, ora).chiave, "FATTO");
  assert.equal(statoMostrato({ statoTask: "DA_FARE", completata: false, scadenza: new Date("2026-11-10") }, ora).nome, "Scaduta");
  assert.equal(statoMostrato({ statoTask: "IN_CORSO", completata: false, scadenza: new Date("2026-11-30") }, ora).nome, "In corso");
  assert.equal(statoMostrato({ statoTask: "DA_FARE", completata: false, scadenza: null }, ora).nome, "Da fare");
});
test("chi è coinvolto: incaricato, autore e in copia, senza doppioni", () => {
  assert.deepEqual(coinvolti({ utenteId: "a", creatoDaId: "b", inCopiaA: ["c", "a"] }).sort(), ["a", "b", "c"]);
  assert.deepEqual(coinvolti({ utenteId: null, creatoDaId: null, inCopiaA: [] }), []);
});
