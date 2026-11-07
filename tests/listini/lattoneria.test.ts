import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARTICOLI_LATTONERIA, COLORI_LATTONERIA, FAMIGLIE_LATTONERIA, SCONTO_ACQUISTO_LATTONERIA, catalogoLattoneria, pesoKg, prezzoLatt, costoLatt, articoloLatt, lattAlMetro, prezzoPerLunghezza, sottogruppoLatt, labelLatt,
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
  assert.equal(costoLatt(ang, 14), 5.65); // costo del fornitore 5,67 → ai 5 cent
  for (const a of ARTICOLI_LATTONERIA) for (const e of [14, 16, 18]) assert.equal(prezzoLatt(a, e), Math.round(costoLatt(a, e) * 200) / 100, a.codice);
  // lo sconto d'acquisto del modello riporta esattamente il costo del fornitore
  assert.equal(SCONTO_ACQUISTO_LATTONERIA, 50);
  assert.equal(Math.round(prezzoLatt(ang, 16) * (1 - SCONTO_ACQUISTO_LATTONERIA / 100) * 100) / 100, costoLatt(ang, 16));
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
  assert.equal(bianco.colore, "Bianco — al metro"); // niente €/kg del fornitore (lo vede il cliente)
  assert.ok(cat.modelli.every((m) => !/€|kg ×|MASTRO/i.test(m.descrizioneTecnica)), "descrizioni senza prezzi del fornitore");
});

test("al metro o al pezzo, lunghezza, sottogruppi ed etichette", () => {
  assert.equal(lattAlMetro("LATT_SCOSS333"), true);
  assert.equal(lattAlMetro("LATT_STAFFA333"), false);
  assert.equal(lattAlMetro("PAVGAL_X"), false);
  assert.equal(prezzoPerLunghezza(11.3, 250), 28.25);
  assert.equal(sottogruppoLatt("LATT_GRONDA250T"), "Gronde (canali)");
  assert.equal(sottogruppoLatt("LATT_PLUV80"), "Pluviali");
  assert.equal(sottogruppoLatt("LATT_TESTATA333"), "Tappi e testate");
  assert.equal(sottogruppoLatt("LATT_ANGOLO333"), "Angoli, giunti e bocchettoni");
  assert.equal(sottogruppoLatt("LATT_ANG30X50"), "Angolari");
  assert.equal(sottogruppoLatt("LATT_U20X30X20"), "Profili a U e a Z, piatti e lamiere");
  assert.equal(sottogruppoLatt("LATT_COPERT333"), "Copertine per muretti");
  assert.equal(sottogruppoLatt("LATT_COLLARE80"), "Staffe e collari");
  // ogni famiglia ha almeno un articolo
  for (const f of FAMIGLIE_LATTONERIA) assert.ok(ARTICOLI_LATTONERIA.some((a) => a.sottogruppo === f), f);
  assert.equal(labelLatt("LATT_ANG30X50"), "Angolare disuguale 30×50 sp. 15/10");
});
