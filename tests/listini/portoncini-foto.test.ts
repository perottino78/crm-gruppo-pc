import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fotoOptionalPortoncino, PANNELLI_CON_FOTO } from "../../src/lib/listini/portoncini-foto";
import optionali from "../../prisma/seed-data/portoncinipvc_optional.json";

test("pannelli: foto per tutti i modelli 01-75", () => {
  assert.equal(PANNELLI_CON_FOTO.length, 75);
  assert.equal(fotoOptionalPortoncino("PANNELLO DECORATIVO", "Pannello decorativo Modello 13 (al posto del vetro)"), "/immagini/portoncini-pvc/pannelli/modello-13.jpg");
  assert.equal(fotoOptionalPortoncino("PANNELLO DECORATIVO", "Pannello decorativo Modello 01 (al posto del vetro)"), "/immagini/portoncini-pvc/pannelli/modello-01.jpg");
  assert.equal(fotoOptionalPortoncino("PANNELLO DECORATIVO", "Pannello decorativo Modello 99 (al posto del vetro)"), null);
});

test("tutte le foto indicate esistono nei file del sito", () => {
  let con = 0;
  for (const o of optionali as { categoria: string; nome: string }[]) {
    const f = fotoOptionalPortoncino(o.categoria, o.nome);
    if (f) { con++; assert.ok(existsSync(`public${f}`), `${o.nome}: ${f}`); }
  }
  assert.ok(con >= 75 + 11 + 3 + 2);
});

test("maniglioni WALA e maniglie", () => {
  assert.match(fotoOptionalPortoncino("MANIGLIONE", "Maniglione WALA P10B inox (L=580, A=510, ø30)") ?? "", /wala-p10b\.png$/);
  assert.match(fotoOptionalPortoncino("MANIGLIA", "Maniglia antieffrazione inox") ?? "", /antieffrazione/);
});
