import test from "node:test";
import assert from "node:assert/strict";
import { COLORI_COMPSFUSI, righeColoriMancanti } from "../../src/lib/listini/compsfusi";

const riga = (tipologia: string, colore: string, larghezzaMm: number, prezzoBase: number) => ({ tipologia, colore, altezzaMm: 0, larghezzaMm, prezzoBase, coefficienteRicarico: 1 });

test("i colori MV Living sono quelli della scheda del profilo", () => {
  assert.equal(COLORI_COMPSFUSI.length, 7);
  assert.ok(COLORI_COMPSFUSI.some((c) => c.includes("7016")) && COLORI_COMPSFUSI.includes("Corten"));
});

test("per ogni misura STANDARD nasce una riga per colore, con lo stesso prezzo", () => {
  const nuove = righeColoriMancanti([riga("COMPSFUSI_PROFILO_M", "STANDARD", 4000, 100), riga("COMPSFUSI_PROFILO_M", "STANDARD", 5000, 125)]);
  assert.equal(nuove.length, 14);
  assert.ok(nuove.every((n) => n.prezzoBase === (n.larghezzaMm === 4000 ? 100 : 125) && n.colore !== "STANDARD"));
});

test("rilanciando non si duplica e le altre tipologie non si toccano", () => {
  const base = [riga("COMPSFUSI_PIANTONE", "STANDARD", 5000, 300), riga("LATT_X", "STANDARD", 10, 5)];
  const prima = righeColoriMancanti(base);
  assert.equal(prima.length, 7);
  assert.equal(righeColoriMancanti([...base, ...prima]).length, 0);
});
