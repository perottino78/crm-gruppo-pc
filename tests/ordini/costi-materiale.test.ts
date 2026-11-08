import { test } from "node:test";
import assert from "node:assert/strict";
import { vociMateriale, corrisponde } from "../../src/lib/ordini/costi-materiale";

const d = new Date("2026-11-01");
const righe = [
  { descrizione: "Finestra", fornitoreNome: "Fidra", costoEffettivo: 500, ordineFornitoreId: "o1", data: d },
  { descrizione: "Coprifilo", fornitoreNome: "Fidra", costoEffettivo: null, ordineFornitoreId: "o1", data: d },
  { descrizione: "Scossalina", fornitoreNome: "Il Mastro", costoEffettivo: 80, ordineFornitoreId: "o2", data: d },
  { descrizione: "Silicone", fornitoreNome: null, costoEffettivo: null, ordineFornitoreId: null, data: d },
];

test("senza conferme: contano le righe con costo", () => {
  const r = vociMateriale(righe, [], false);
  assert.equal(r.voci.reduce((t, v) => t + v.importo, 0), 580);
  assert.equal(r.righeSenzaCosto, 2);
});

test("totale confermato: sostituisce le righe di quell'ordine", () => {
  const ordini = [{ id: "o1", numero: "12/2026", fornitoreNome: "Fidra", totaleConfermato: 1200, confermatoIl: d, fatturato: false }];
  const r = vociMateriale(righe, ordini, false);
  assert.equal(r.voci.reduce((t, v) => t + v.importo, 0), 1280);
  assert.equal(r.righeSenzaCosto, 1);
  assert.ok(r.voci.some((v) => v.tipo === "Materiale (conferma fornitore)" && v.importo === 1200));
});

test("arrivata la fattura: la conferma non conta più", () => {
  const ordini = [{ id: "o1", numero: "12/2026", fornitoreNome: "Fidra", totaleConfermato: 1200, confermatoIl: d, fatturato: true }];
  const r = vociMateriale(righe, ordini, false);
  assert.equal(r.voci.reduce((t, v) => t + v.importo, 0), 580);
});

test("modo rapido: niente righe né conferme", () => {
  const ordini = [{ id: "o1", numero: "12/2026", fornitoreNome: "Fidra", totaleConfermato: 1200, confermatoIl: d, fatturato: false }];
  assert.deepEqual(vociMateriale(righe, ordini, true), { voci: [], righeSenzaCosto: 0 });
});

test("ricerca: tutte le parole, senza accenti", () => {
  assert.ok(corrisponde("Scossalina in alluminio — Bianco", "scoss bianco"));
  assert.ok(corrisponde("Porta più alta", "piu"));
  assert.ok(!corrisponde("Scossalina", "copertina"));
});
