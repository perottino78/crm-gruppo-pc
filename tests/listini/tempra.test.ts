import { test } from "node:test";
import assert from "node:assert/strict";
import prodotti from "../../prisma/seed-data/tempra_prodotti.json";
import { optionalTempra, labelTempra, descrizioneTempra } from "../../src/lib/listini/tempra";
import { sottogruppoDiTipologia, labelBreveTipologia, listinoDiTipologia, etichetteDimensioni, assiSelezioneIsomax } from "../../src/lib/prodotti";

type P = { tipologia: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number; listino: number };
const righe = prodotti as P[];
const cella = (t: string, L: number, H: number) => righe.find((p) => p.tipologia === t && p.larghezzaMm === L && p.altezzaMm === H);

test("tabelle del listino × 1,6", () => {
  assert.equal(cella("STABYLA_A701_AD", 2526, 2000)?.listino, 4291);
  assert.equal(cella("STABYLA_A701_AD", 2526, 2000)?.prezzoBase, 6865.6);
  assert.equal(cella("STABYLA_A701_AU", 8680, 4000)?.listino, 18144); // esempio del listino
  assert.equal(cella("STABYLA_A705_AU", 8803, 5000)?.listino, 24429); // esempio del listino
  assert.equal(cella("STABYLA_A707_AU", 10265, 6000)?.listino, 32835);
  assert.ok(righe.every((p) => Math.abs(p.prezzoBase - p.listino * 1.6) < 0.01));
});

test("8 tipologie complete, senza doppioni", () => {
  const per = new Map<string, number>();
  for (const p of righe) per.set(p.tipologia, (per.get(p.tipologia) ?? 0) + 1);
  assert.equal(per.size, 8);
  for (const [t, n] of per) assert.equal(n, t.match(/A70[57]/) ? 63 : 42, t);
  assert.equal(new Set(righe.map((p) => `${p.tipologia}|${p.larghezzaMm}|${p.altezzaMm}`)).size, righe.length);
});

test("etichette, tendine e optional", () => {
  assert.equal(sottogruppoDiTipologia("STABYLA_A703_AU"), "Tempra (pannelli coibentati)");
  assert.equal(labelBreveTipologia("STABYLA_A703_AU"), labelTempra("STABYLA_A703_AU"));
  assert.equal(assiSelezioneIsomax("STABYLA_A705_AD")?.apertura.label, "Addossata (a parete)");
  assert.equal(listinoDiTipologia("STABYLA_A701_AD"), "TEMPRA");
  assert.equal(etichetteDimensioni("STABYLA_A701_AD").altezza, "Sporgenza");
  assert.match(descrizioneTempra("STABYLA_A707_AU")!, /6000 mm/);
  const opt = optionalTempra();
  assert.equal(opt.find((o) => o.nome.startsWith("Strip LED white da 5 m"))?.valore, 880);
  assert.equal(opt.find((o) => o.nome.startsWith("Centralina"))?.valore, 563.2);
  assert.equal(opt.find((o) => o.nome.startsWith("Pannello termico sp. 55"))?.tipoPrezzo, "PERCENTUALE");
});
