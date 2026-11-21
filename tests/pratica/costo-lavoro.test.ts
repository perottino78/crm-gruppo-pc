import { test } from "node:test";
import assert from "node:assert/strict";
import { costoAlMinuto, costoLavoro, durataLeggibile, numeroIt } from "../../src/lib/pratica/costo-lavoro";

test("costo al minuto e del lavoro", () => {
  assert.equal(costoAlMinuto(60), 1);
  assert.equal(costoAlMinuto(33), 0.55);
  assert.equal(costoAlMinuto(0), 0);
  assert.equal(costoLavoro(45, 40), 30);
  assert.equal(costoLavoro(90, 33.5), 50.25);
  assert.equal(costoLavoro(7, 35), 4.08); // 4,0833…
  assert.equal(costoLavoro(0, 40), 0);
  assert.equal(costoLavoro(null, 40), 0);
  assert.equal(costoLavoro(30, null), 0);
  assert.equal(costoLavoro(-5, 40), 0);
});

test("durata leggibile e numeri all'italiana", () => {
  assert.equal(durataLeggibile(45), "45 min");
  assert.equal(durataLeggibile(60), "1 h");
  assert.equal(durataLeggibile(135), "2 h 15 min");
  assert.equal(numeroIt("33,5"), 33.5);
  assert.equal(numeroIt("1.250,50"), 1250.5);
  assert.equal(numeroIt(""), null);
  assert.equal(numeroIt("abc"), null);
});
