import { test } from "node:test";
import assert from "node:assert/strict";
import articoli from "../../prisma/seed-data/pavgal_articoli.json";
import { catalogoPavgal, listiniPavgal, labelPavgal, piedini, type ArticoloPavgal } from "../../src/lib/listini/pavimenti-galleggianti";
import { sottogruppoDiTipologia, labelBreveTipologia, notaInArrivo } from "../../src/lib/prodotti";

const art = articoli as ArticoloPavgal[];
const cat = catalogoPavgal(art);

test("articoli del listino La Faenza 2025 (2 cm, antiscivolo)", () => {
  assert.equal(art.length, 100);
  assert.equal(art.find((a) => a.codice === "179201")?.prezzo, 91.05); // GEA 60AG AS RM 60x60 al m²
  assert.equal(art.find((a) => a.codice === "193275")?.prezzo, 124.15); // BLANCO 90W ASRM 90x90
  assert.ok(art.every((a) => a.kgMq >= 40));
});

test("13 tipologie collezione × formato, varianti = colori al m²", () => {
  assert.equal(cat.modelli.length, 13);
  assert.equal(cat.prodotti.length, 41);
  assert.equal(cat.prodotti.filter((p) => p.tipologia === "PAVGAL_VIS_90X90").length, 8);
  assert.equal(labelPavgal("PAVGAL_YKSG_30X120"), "Yakisugi 30×120 — gres 2 cm");
  assert.equal(labelBreveTipologia("PAVGAL_GEA_60X60"), "Gea 60×60 — gres 2 cm");
  assert.equal(sottogruppoDiTipologia("PAVGAL_GEA_60X60"), "Pavimenti galleggianti");
  assert.equal(notaInArrivo("PAVGALLEGGIANTI_PLACEHOLDER"), null);
});

test("piedini: 4 per piastrella, 4 € il 60×60, 6 € i formati grandi", () => {
  assert.equal(Math.round(piedini("60x60").piediniMq * 10) / 10, 11.1);
  const op = (f: string) => cat.optional.find((o) => o.listino === `PAVGAL_F${f}`)!;
  assert.equal(op("60X60").valore, 44.44);
  assert.equal(op("90X90").valore, 29.63);
  assert.equal(op("30X120").valore, 66.67);
});

test("optional giusti per ogni pavimento", () => {
  const vis = (t: string) => cat.optional.filter((o) => listiniPavgal(t).includes(o.listino));
  const gea = vis("PAVGAL_GEA_60X60");
  assert.ok(gea.some((o) => o.nome.startsWith("Bordo piscina")));
  assert.ok(gea.some((o) => o.nome.startsWith("Posa in opera") && o.valore === 50));
  assert.ok(gea.some((o) => o.nome.startsWith("Piedini regolabili per 60×60")));
  assert.ok(!gea.some((o) => o.nome.startsWith("Piedini regolabili per 90×90")));
  assert.ok(!vis("PAVGAL_VIS_90X90").some((o) => o.nome.includes("GEA")));
  assert.equal(new Set(cat.optional.map((o) => `${o.listino}|${o.categoria}|${o.nome}`)).size, cat.optional.length);
});
