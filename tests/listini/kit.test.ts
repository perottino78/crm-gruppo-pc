import { test } from "node:test";
import assert from "node:assert/strict";
import { quantitaComponente } from "../../src/lib/listini/kit";

test("kit: per pezzo, fisso, al metro, al m², arrotondamenti", () => {
  assert.equal(quantitaComponente({ quantita: 4, calcolo: "PEZZO" }, { quantita: 3 }), 12);
  assert.equal(quantitaComponente({ quantita: 1, calcolo: "FISSO" }, { quantita: 3 }), 1);
  // angolare 2 al metro, vetrata larga 4200 mm, 1 pezzo → 8,4 → 9
  assert.equal(quantitaComponente({ quantita: 2, calcolo: "METRO" }, { quantita: 1, larghezza: 4200, unita: "mm" }), 9);
  // listino in cm: 350 cm × 2 pezzi × 1 al metro = 7
  assert.equal(quantitaComponente({ quantita: 1, calcolo: "METRO" }, { quantita: 2, larghezza: 350, unita: "cm" }), 7);
  // 1 al m²: 1200×1400 mm = 1,68 → 2
  assert.equal(quantitaComponente({ quantita: 1, calcolo: "MQ" }, { quantita: 1, larghezza: 1200, altezza: 1400 }), 2);
  // senza misura: vale per pezzo
  assert.equal(quantitaComponente({ quantita: 2, calcolo: "METRO" }, { quantita: 3 }), 6);
  // niente errori di virgola: 0,1 × 30 = 3, non 4
  assert.equal(quantitaComponente({ quantita: 0.1, calcolo: "PEZZO" }, { quantita: 30 }), 3);
});
