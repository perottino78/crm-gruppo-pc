import { test } from "node:test";
import assert from "node:assert/strict";
import { RICAMBI_VETRATE, alMetro, rigaArticolo } from "../../src/lib/listini/ricambi-vetrate";

test("guarnizione 2360 come nella scheda di BConsole", () => {
  const g = RICAMBI_VETRATE.find((r) => r.codice === "2360")!;
  assert.equal(g.costo, 8.7);
  assert.equal(g.vendita, 24);
  assert.equal(g.um, "m");
  assert.equal(g.sistema, "Scintilla");
  assert.ok(new Set(RICAMBI_VETRATE.map((r) => r.codice)).size === RICAMBI_VETRATE.length, "codici unici");
});

test("riga d'offerta: al metro i metri vanno nel prezzo e nel testo, a pezzo la quantità", () => {
  assert.ok(alMetro("mt") && alMetro("Mt") && alMetro("m") && !alMetro("pz") && !alMetro("ml"));
  const g = { codice: "2360", descrizione: "Guarnizione", descrizioneEstesa: "Sigilla dal maltempo.", um: "mt", prezzoVendita: 24 };
  const r = rigaArticolo(g, "4,5");
  assert.equal(r.quantita, 1);
  assert.equal(r.prezzoUnitario, 108);
  assert.equal(r.testoLibero, "2360 — Guarnizione — 4,5 mt × 24,00 €/mt\nSigilla dal maltempo.");
  assert.equal(rigaArticolo(g, "abc").prezzoUnitario, 24);
  const p = rigaArticolo({ codice: "X1", descrizione: "Rotella", um: "pz", prezzoVendita: 3.5 }, "2,6");
  assert.deepEqual(p, { testoLibero: "X1 — Rotella", quantita: 3, prezzoUnitario: 3.5 });
});

test("ricambi della Brillante dalle schede BConsole (23112 e BRI1409)", () => {
  const a = RICAMBI_VETRATE.find((r) => r.codice === "23112")!;
  const b = RICAMBI_VETRATE.find((r) => r.codice === "BRI1409")!;
  assert.deepEqual([a.sistema, a.um, a.costo, a.vendita], ["Brillante", "pz", 16.31, 32.54]);
  assert.deepEqual([b.sistema, b.um, b.costo, b.vendita], ["Brillante", "pz", 11.9, 44.34]);
  assert.ok(!/guarniiz|cxalam|\bntegrata/i.test(a.descrizione), "refusi corretti");
});
