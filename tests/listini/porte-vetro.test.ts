import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogoPorteVetro, listiniPorteVetro, labelPortaVetro } from "../../src/lib/listini/porte-vetro";
import { labelBreveTipologia, listinoDiTipologia } from "../../src/lib/prodotti";

const cat = catalogoPorteVetro();

test("prezzi = listino fornitore + 60%", () => {
  assert.deepEqual(cat.prodotti.filter((p) => p.tipologia === "PORTAVETRO_PAL").map((p) => p.prezzoBase), [2608, 2608]);
  assert.equal(cat.prodotti.find((p) => p.tipologia === "PORTAVETRO_PTV")?.prezzoBase, 4528);
  assert.equal(cat.optional.find((o) => o.nome.startsWith("Maniglione antipanico"))?.valore, 483.2);
  const h = cat.optional.find((o) => o.nome.startsWith("Altezza oltre 2500"))!;
  assert.equal(h.tipoPrezzo, "PERCENTUALE");
  assert.equal(h.valore, 5);
});

test("optional giusti per ogni porta", () => {
  const vis = (t: string) => cat.optional.filter((o) => listiniPorteVetro(t).includes(o.listino));
  assert.ok(vis("PORTAVETRO_PAL").some((o) => o.nome.startsWith("Maniglione antipanico")));
  assert.ok(!vis("PORTAVETRO_PTV").some((o) => o.nome.startsWith("Maniglione antipanico")));
  assert.ok(vis("PORTAVETRO_PTV").some((o) => o.nome === "Apribile verso entrambi gli ambienti"));
  assert.ok(vis("PORTAVETRO_PTV").some((o) => o.nome.startsWith("Altezza oltre")));
  assert.equal(listinoDiTipologia("PORTAVETRO_PTV"), "PORTAVETRO");
  assert.equal(labelBreveTipologia("PORTAVETRO_PAL"), labelPortaVetro("PORTAVETRO_PAL"));
  assert.ok(cat.modelli.every((m) => m.immagineUrl.startsWith("/immagini/porte-vetro/")));
});
