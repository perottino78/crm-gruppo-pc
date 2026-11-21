import test from "node:test";
import assert from "node:assert/strict";
import { barraPiuVicina } from "../../src/lib/prezzoPerMisura";

const barre = [400, 500, 600, 700];

test("la barra più vicina alla misura scritta", () => {
  assert.equal(barraPiuVicina(barre, 430, "cm")?.lunghezza, 400);
  assert.equal(barraPiuVicina(barre, 470, "cm")?.lunghezza, 500);
  assert.equal(barraPiuVicina(barre, 520, "cm")?.lunghezza, 500);
  assert.equal(barraPiuVicina(barre, 100, "cm")?.lunghezza, 400);
  assert.equal(barraPiuVicina(barre, 1000, "cm"), null); // oltre la barra più lunga: fuori listino
});

test("a parità si sceglie la barra più lunga", () => {
  assert.equal(barraPiuVicina(barre, 450, "cm")?.lunghezza, 500);
});

test("4000 scritto in millimetri vale 400 cm", () => {
  const r = barraPiuVicina(barre, 4000, "cm");
  assert.deepEqual([r?.lunghezza, r?.inMm], [400, true]);
  assert.equal(barraPiuVicina(barre, 6900, "cm")?.lunghezza, 700);
});

test("senza lunghezze o con misura non valida non c'è risultato", () => {
  assert.equal(barraPiuVicina([], 400, "cm"), null);
  assert.equal(barraPiuVicina(barre, 0, "cm"), null);
});
