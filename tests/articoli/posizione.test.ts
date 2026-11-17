import { test } from "node:test";
import assert from "node:assert/strict";
import { posizioneEffettiva, categorieDelListino, testoPosizione, type CatPosizione } from "../../src/lib/articoli/posizione";

const cat: CatPosizione[] = [
  { id: "r", padreId: null, famiglia: "OUTDOOR", gruppoListino: "VETRATE" },
  { id: "r1", padreId: "r", famiglia: null, gruppoListino: null },
  { id: "s", padreId: null, famiglia: "OUTDOOR", gruppoListino: null },
  { id: "x", padreId: null, famiglia: null, gruppoListino: null },
];
test("la sottocategoria prende la posizione della madre", () => {
  assert.deepEqual(posizioneEffettiva("r1", cat), { famiglia: "OUTDOOR", gruppo: "VETRATE" });
  assert.equal(posizioneEffettiva("x", cat), null);
  assert.equal(testoPosizione(posizioneEffettiva("r", cat)), "OUTDOOR › VETRATE");
  assert.match(testoPosizione(null), /solo anagrafica/);
});
test("categorie di un gruppo o della sola famiglia", () => {
  assert.deepEqual(categorieDelListino("OUTDOOR", "VETRATE", cat).sort(), ["r", "r1"]);
  assert.deepEqual(categorieDelListino("OUTDOOR", null, cat), ["s"]);
  assert.deepEqual(categorieDelListino("INDOOR", "VETRATE", cat), []);
});
