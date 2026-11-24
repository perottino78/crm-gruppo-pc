import { test } from "node:test";
import assert from "node:assert/strict";
import { misureDaModulo, conMisureDefinitive } from "../../src/lib/ordini/misure";

test("misure dal modulo serramenti: una voce per finestra con L e H", () => {
  const m = misureDaModulo({ tab_fin_1_L: "1200", tab_fin_1_H: "1400", tab_fin_1_pos: "F1", tab_fin_1_stanza: "Cucina", tab_fin_1_qta: "2", tab_fin_2_L: "900", tab_fin_3_L: "800", tab_fin_3_H: "2100,5" });
  assert.equal(m.length, 2);
  assert.deepEqual(m[0], { etichetta: "F1 · Cucina", misure: "1200×1400 mm", quantita: 2 });
  assert.equal(m[1].misure, "800×2100.5 mm");
  assert.deepEqual(misureDaModulo(null), []);
});

test("le misure definitive si aggiungono alla descrizione", () => {
  assert.equal(conMisureDefinitive("Finestra 2 ante", "1200×1400 mm"), "Finestra 2 ante — misure definitive: 1200×1400 mm");
  assert.equal(conMisureDefinitive("Finestra", "  "), "Finestra");
});

test("misure dalle vetrate e dalle pergole", () => {
  assert.equal(misureDaModulo({ larghezza_mm: "3200", altezza_mm: "2400", misure_riferite: "Interne" })[0].misure, "3200×2400 mm");
  const p = misureDaModulo({ tab_dimensioni_1_L: "4000", tab_dimensioni_1_S: "3500", tab_dimensioni_1_H: "2600", tab_qta_1_qta: "1" });
  assert.equal(p[0].misure, "L 4000 × S 3500 × H 2600 mm");
});
