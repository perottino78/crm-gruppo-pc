import { test } from "node:test";
import assert from "node:assert/strict";
import { lineaDi, ripartisci } from "../../src/lib/amministrazione/linee";

test("linee di prodotto dai gruppi del listino", () => {
  assert.equal(lineaDi("INDOOR", "SERRAMENTI"), "Serramenti e persiane");
  assert.equal(lineaDi("INDOOR", "TAPPARELLE"), "Serramenti e persiane");
  assert.equal(lineaDi("INDOOR", "PORTONCINI PVC"), "Serramenti e persiane");
  assert.equal(lineaDi("INDOOR", "ZANZARIERE_PLISSE"), "Zanzariere");
  assert.equal(lineaDi("INDOOR", "BLINDATI"), "Blindati, cancelli e grate");
  assert.equal(lineaDi("INDOOR", "PORTE INTERNE"), "Porte interne");
  assert.equal(lineaDi("INDOOR", "TENDE INTERNE"), "Tende interne");
  assert.equal(lineaDi("OUTDOOR", "VETRATE SCINTILLA"), "Vetrate");
  assert.equal(lineaDi("OUTDOOR", "PERGOLE", "P&C", "NUBES_MOB_50_PC_STD_MAN"), "Vetrate");
  assert.equal(lineaDi("OUTDOOR", "BIOCLIMATICA"), "Pergole e bioclimatiche");
  assert.equal(lineaDi("OUTDOOR", "TENDE A CADUTA"), "Tende da sole e schermature");
  assert.equal(lineaDi("OUTDOOR", "LINEA ZIP"), "Tende da sole e schermature");
  assert.equal(lineaDi("OUTDOOR", "TENDE CLASSICHE"), "Tende da sole e schermature");
  assert.equal(lineaDi("OUTDOOR", "PAVIMENTI"), "Giardino e pavimenti");
  assert.equal(lineaDi("OUTDOOR", "MOTORI E AUTOMATISMI"), "Motori e automatismi");
  assert.equal(lineaDi("PURAFONTE", "OSMOSI"), "Depurazione acqua");
  assert.equal(lineaDi("SOLARIS", "POMPE DI CALORE"), "Termico e pompe di calore");
  assert.equal(lineaDi("SOLARIS", "CONDIZIONATORI"), "Climatizzazione");
  assert.equal(lineaDi("SERVIZI", "Posa in Opera Tapparelle"), "Posa e servizi");
  assert.equal(lineaDi(null, null, "Solaris"), "Fotovoltaico");
  assert.equal(lineaDi(null, null, "P&C"), "Altro");
});

test("ripartizione al centesimo", () => {
  const r = ripartisci(100, new Map([["A", 1], ["B", 1], ["C", 1]]));
  assert.deepEqual([...r.values()].reduce((t, v) => t + v, 0), 100);
  assert.equal(r.get("A"), 33.34); // il resto va alla prima/maggiore
  const r2 = ripartisci(9553.28, new Map([["Serramenti e persiane", 7000], ["Posa e servizi", 1200], ["Zanzariere", 300]]));
  assert.equal(Math.round([...r2.values()].reduce((t, v) => t + v, 0) * 100), 955328);
  assert.deepEqual([...ripartisci(50, new Map()).entries()], [["Altro", 50]]);
  assert.deepEqual([...ripartisci(50, new Map([["X", 0]])).entries()], [["Altro", 50]]);
});
