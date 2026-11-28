import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { schedaCliente, schedeDelleTipologie } from "../../src/lib/preventivi/scheda-cliente";
import prodotti from "../../prisma/seed-data/nuvola_prodotti.json";

test("la pergola Nuvola ha la sua scheda tecnica, una sola per tutte le versioni", () => {
  const tipologie = [...new Set(prodotti.map((p) => p.tipologia))].sort();
  assert.deepEqual(tipologie, ["NUVOLA_ISOLA", "NUVOLA_NL140", "NUVOLA_PARETE", "NUVOLA_PATIO_SOFFITTO"]);
  for (const t of tipologie) {
    const s = schedaCliente(t);
    assert.ok(s && s.chiave === "NUVOLA", t);
  }
  const s = schedaCliente("NUVOLA_PARETE")!;
  assert.equal(s.pagine.length, 2);
  assert.ok(s.descrizione.includes("EN 13561") && !/mv|lipari|line/i.test(s.descrizione));
  assert.equal(schedeDelleTipologie(["NUVOLA_ISOLA", "NUVOLA_NL140"]).length, 1);
  const root = new URL("../../public", import.meta.url).pathname;
  for (const f of [s.pdf, ...s.pagine]) assert.ok(fs.existsSync(root + f), f);
});

test("la scheda non nomina il fornitore", () => {
  const pdf = fs.readFileSync(new URL("../../public/cataloghi/nuvola/Nuvola-scheda-tecnica.pdf", import.meta.url));
  assert.ok(!/mv ?line|mv ?living/i.test(pdf.toString("latin1")));
});

test("non si confonde con le altre pergole", () => {
  assert.equal(schedaCliente("LUCILLA_PARETE_SINGOLA")?.chiave, "LUCILLA");
  assert.notEqual(schedaCliente("PANAREA_ISOLA")?.chiave, "NUVOLA");
});
