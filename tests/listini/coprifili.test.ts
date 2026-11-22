import { test } from "node:test";
import assert from "node:assert/strict";
import { ARTICOLI_COPRIFILI, COLORI_COPRIFILI, catalogoCoprifili, costoCoprifiloAlMetro, labelCoprifilo, sottogruppoCoprifilo } from "../../src/lib/listini/coprifili";
import { lattAlMetro } from "../../src/lib/listini/lattoneria";
import { sottogruppoDiTipologia } from "../../src/lib/prodotti";

const art = (c: string) => ARTICOLI_COPRIFILI.find((a) => a.codice === c)!;
const col = (n: string) => COLORI_COPRIFILI.find((c) => c.nome.startsWith(n))!;

test("listino EXTE: 81 articoli, coprifili piatti 30 e 60 con i tre prezzi", () => {
  assert.equal(ARTICOLI_COPRIFILI.length, 81);
  assert.deepEqual(art("65025030").per100m, { bianco: 59.74, protettiva: 60.48, rivestito: 271.14 });
  assert.deepEqual(art("65025060").per100m, { bianco: 125.81, protettiva: 127.26, rivestito: 385.46 });
  assert.deepEqual(art("71040020").per100m, { bianco: 128.67, protettiva: null, rivestito: 620 });
});

test("costo al metro per colore (sovrapprezzi della pellicola sul rivestito, Salamander +15% sul bianco)", () => {
  assert.equal(costoCoprifiloAlMetro(art("65025060"), col("Bianco")), 1.26);
  assert.equal(costoCoprifiloAlMetro(art("65025060"), col("Antracite")), 3.85);
  assert.equal(costoCoprifiloAlMetro(art("65025060"), col("Rosso vino")), 4.43);
  assert.equal(costoCoprifiloAlMetro(art("65025060"), col("Bianco Salamander")), 1.45);
  assert.equal(costoCoprifiloAlMetro(art("65025025"), col("Antracite")), null); // pellicolato non a catalogo
});

test("nomi, sottogruppi e vendita al metro", () => {
  assert.equal(labelCoprifilo("COPRIF_65025030"), "Coprifilo piatto 30 x 2,5 (EXTE 65025030)");
  assert.equal(sottogruppoCoprifilo("COPRIF_71030030"), "Coprifili PVC — Listino completo");
  assert.equal(sottogruppoDiTipologia("COPRIF_640730"), "Coprifili PVC — Listino completo");
  assert.equal(lattAlMetro("COPRIF_65025030"), true);
  const { prodotti } = catalogoCoprifili();
  assert.ok(prodotti.every((p) => p.colore.endsWith("— al metro") && p.prezzoBase > 0));
});
