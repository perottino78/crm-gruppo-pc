import { test } from "node:test";
import assert from "node:assert/strict";
import prodotti from "../../prisma/seed-data/fidra_prodotti.json";
import { TIPOLOGIE_FIDRA, listiniFidra, optionalFidra, labelFidra } from "../../src/lib/listini/fidra";
import { sottogruppoDiTipologia, labelBreveTipologia, listinoDiTipologia, unitaMisura, notaInArrivo } from "../../src/lib/prodotti";

type P = { tipologia: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number };
const righe = prodotti as P[];
const prezzo = (t: string, L: number, H: number) => righe.find((p) => p.tipologia === t && p.larghezzaMm === L && p.altezzaMm === H)?.prezzoBase;

test("griglie come nel listino (prezzi al cliente)", () => {
  assert.equal(prezzo("FIDRA_F1A", 500, 700), 627);
  assert.equal(prezzo("FIDRA_F1A", 800, 500), 653.4);
  assert.equal(prezzo("FIDRA_PF2A_SOGLIA", 700, 1600), 1700.6);
  assert.equal(prezzo("FIDRA_PF1A_SOGLIA", 700, 1500), 1229.8);
  assert.equal(prezzo("FIDRA_PF3A", 1200, 1500), 3011.8);
  assert.equal(prezzo("FIDRA_TRASLANTE", 1600, 1500), 3410);
});

test("«*» = primo prezzo disponibile", () => {
  assert.equal(prezzo("FIDRA_F1A", 500, 500), 653.4); // a destra nella stessa riga
  assert.equal(prezzo("FIDRA_PF1A", 500, 1500), 1111);
  assert.equal(prezzo("FIDRA_F2A", 1100, 500), undefined); // «-» non eseguibile
});

test("tutte le tipologie hanno griglia, etichetta e sottogruppo", () => {
  for (const t of Object.keys(TIPOLOGIE_FIDRA)) {
    assert.ok(righe.filter((p) => p.tipologia === t).length > 50, t);
    assert.equal(sottogruppoDiTipologia(t), "Alluminio — Fidra");
    assert.equal(labelBreveTipologia(t), labelFidra(t));
    assert.equal(listinoDiTipologia(t), "FIDRA");
    assert.equal(unitaMisura(t), "mm");
  }
  assert.equal(new Set(righe.map((p) => `${p.tipologia}|${p.larghezzaMm}|${p.altezzaMm}`)).size, righe.length);
  assert.equal(notaInArrivo("SERRAMENTI_PVCALLUMINIO_FIDRA_PLACEHOLDER"), null);
});

test("optional: satinato e maniglia passante su tutti; satinato 90 € finestre / 150 € portefinestre; motoriduttore solo wasistas", () => {
  const opt = optionalFidra();
  const visibili = (t: string) => opt.filter((o) => listiniFidra(t).includes(o.listino));
  assert.equal(visibili("FIDRA_F2A").find((o) => o.nome.startsWith("Vetro satinato"))?.valore, 90);
  assert.equal(visibili("FIDRA_PF2A").find((o) => o.nome.startsWith("Vetro satinato"))?.valore, 150);
  assert.ok(visibili("FIDRA_PF1A").some((o) => o.nome.startsWith("Maniglia passante")));
  assert.ok(visibili("FIDRA_F1A").some((o) => o.nome.startsWith("Maniglia passante"))); // su tutti i serramenti (richiesta di Ugo)
  for (const t of ["FIDRA_FF", "FIDRA_W", "FIDRA_F3A", "FIDRA_TRASLANTE"]) assert.ok(visibili(t).some((o) => o.nome.startsWith("Vetro satinato")), t);
  assert.ok(visibili("FIDRA_W").some((o) => o.nome.startsWith("Motoriduttore")));
  assert.ok(!visibili("FIDRA_F1A").some((o) => o.nome.startsWith("Motoriduttore")));
  assert.equal(new Set(opt.map((o) => `${o.listino}|${o.categoria}|${o.nome}`)).size, opt.length);
});
