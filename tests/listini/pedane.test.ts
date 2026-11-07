import { test } from "node:test";
import assert from "node:assert/strict";
import { listinoPedana, catalogoPedane } from "../../src/lib/listini/pedane";
import { sottogruppoDiTipologia, labelBreveTipologia, unitaMisura, etichetteDimensioni } from "../../src/lib/prodotti";

test("la formula ridà le tabelle del listino (pag. 319)", () => {
  // multistrato di betulla / gres
  const betulla: [number, number, number][] = [[200, 200, 1280], [250, 250, 2000], [600, 650, 12480], [550, 1100, 19360], [600, 1100, 21120], [350, 950, 10640]];
  for (const [a, b, v] of betulla) assert.equal(listinoPedana(320, a, b), v, `${a}×${b}`);
  // WPC / Ipè (arrotondati ai 10 €)
  const wpc: [number, number, number][] = [[200, 200, 1800], [250, 250, 2810], [300, 250, 3380], [350, 250, 3940], [450, 250, 5060], [450, 450, 9110],
    [500, 450, 10130], [550, 550, 13610], [550, 950, 23510], [250, 1100, 12380], [600, 1100, 29700], [350, 1050, 16540], [450, 850, 17210], [500, 1050, 23630]];
  for (const [a, b, v] of wpc) assert.equal(listinoPedana(450, a, b), v, `${a}×${b}`);
});

test("catalogo: 4 superfici × 171 misure, vendita = listino × 2", () => {
  const { prodotti, modelli } = catalogoPedane();
  assert.equal(prodotti.length, 4 * 171);
  assert.equal(modelli.length, 4);
  assert.ok(prodotti.every((p) => p.prezzoBase === p.listino * 2));
  assert.equal(prodotti.find((p) => p.tipologia === "PEDANA_IPE" && p.larghezzaMm === 400 && p.altezzaMm === 400)?.prezzoBase, 14400);
  assert.equal(sottogruppoDiTipologia("PEDANA_WPC"), "Pedane autoportanti (bar e ristoranti)");
  assert.equal(labelBreveTipologia("PEDANA_GRES"), "Pedana — gres");
  assert.equal(unitaMisura("PEDANA_GRES"), "cm");
  assert.equal(etichetteDimensioni("PEDANA_GRES").altezza, "Sporgenza");
});
