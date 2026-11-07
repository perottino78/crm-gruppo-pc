import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARTICOLI_LATTONERIA, COLORI_LATTONERIA, catalogoLattoneria, pesoKg, prezzoLatt, articoloLatt, lattAlMetro, prezzoPerLunghezza, sottogruppoLatt, labelLatt,
} from "../../src/lib/listini/lattoneria";

test("peso: sviluppo × spessore × 2,7", () => {
  const ang = articoloLatt("LATT_ANG50X50")!;
  assert.equal(Math.round(pesoKg(ang) * 1000), 405); // 100 mm × 1,5 mm × 2,7 = 0,405 kg/m
  const curva = articoloLatt("LATT_CURVA80")!;
  assert.equal(Math.round(pesoKg(curva) * 1000) / 1000, Math.round(0.262 * 0.8 * 2.7 * 0.3 * 1000) / 1000);
});

test("prezzo a peso per fascia di colore (ricarico ×2, ai 10 centesimi)", () => {
  const ang = articoloLatt("LATT_ANG50X50")!;
  assert.equal(prezzoLatt(ang, 14), 11.3); // 0,405 × 14 × 2 = 11,34
  assert.equal(prezzoLatt(ang, 16), 13); // 12,96
  assert.equal(prezzoLatt(ang, 18), 14.6); // 14,58
  assert.equal(prezzoLatt(ang, 14, 1), 5.7); // costo materiale
  // minimo 1 € al pezzo
  assert.equal(prezzoLatt(articoloLatt("LATT_TAPPOANG50")!, 14), 1);
});

test("catalogo: ogni articolo in tutti i colori, codici unici", () => {
  const cat = catalogoLattoneria();
  assert.equal(new Set(ARTICOLI_LATTONERIA.map((a) => a.codice)).size, ARTICOLI_LATTONERIA.length);
  assert.equal(cat.prodotti.length, ARTICOLI_LATTONERIA.length * COLORI_LATTONERIA.length);
  assert.equal(cat.modelli.length, ARTICOLI_LATTONERIA.length);
  assert.ok(cat.prodotti.every((p) => p.prezzoBase >= 1 && p.larghezzaMm === 0 && p.altezzaMm === 0));
  assert.equal(new Set(cat.prodotti.map((p) => `${p.tipologia}|${p.colore}`)).size, cat.prodotti.length);
  const bianco = cat.prodotti.find((p) => p.tipologia === "LATT_GRONDA333Q" && p.colore.startsWith("Bianco"))!;
  assert.match(bianco.colore, /14 €\/kg — al metro/);
});

test("al metro o al pezzo, lunghezza, sottogruppi ed etichette", () => {
  assert.equal(lattAlMetro("LATT_SCOSS333"), true);
  assert.equal(lattAlMetro("LATT_STAFFA333"), false);
  assert.equal(lattAlMetro("PAVGAL_X"), false);
  assert.equal(prezzoPerLunghezza(11.3, 250), 28.25);
  assert.equal(sottogruppoLatt("LATT_GRONDA250T"), "Gronde e pluviali");
  assert.equal(sottogruppoLatt("LATT_TESTATA333"), "Curve, tappi e staffe");
  assert.equal(labelLatt("LATT_ANG30X50"), "Angolare disuguale 30×50 sp. 15/10");
});
