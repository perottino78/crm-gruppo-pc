import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { schedaCliente, schedeDelleTipologie } from "../../src/lib/preventivi/scheda-cliente";
import modelli from "../../prisma/seed-data/panarea_modelli.json";

test("la pergola Panarea ha la sua scheda tecnica, una sola per Easy e Standard", () => {
  assert.equal(modelli.length, 6);
  for (const m of modelli) {
    const s = schedaCliente(m.tipologia);
    assert.ok(s && s.chiave === "PANAREA", m.tipologia);
  }
  const s = schedaCliente("PANAREA_EASY_ISOLA")!;
  assert.equal(s.pagine.length, 2);
  assert.ok(s.descrizione.includes("EN 13561") && !/mv|line|living|lipari/i.test(s.descrizione));
  assert.equal(schedeDelleTipologie(["PANAREA_EASY_PARETE", "PANAREA_STANDARD_PATIO"]).length, 1);
  const root = new URL("../../public", import.meta.url).pathname;
  for (const f of [s.pdf, ...s.pagine]) assert.ok(fs.existsSync(root + f), f);
});

test("non si confonde con le altre pergole", () => {
  assert.equal(schedaCliente("NUVOLA_PARETE")?.chiave, "NUVOLA");
  assert.equal(schedaCliente("LUCILLA_PARETE_SINGOLA")?.chiave, "LUCILLA");
});
