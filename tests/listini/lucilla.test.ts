import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { schedaCliente, schedeDelleTipologie } from "../../src/lib/preventivi/scheda-cliente";
import modelli from "../../prisma/seed-data/lucilla_modelli.json";

test("la pergola Lucilla ha la sua scheda tecnica, una sola per tutte le configurazioni", () => {
  for (const m of modelli) {
    const s = schedaCliente(m.tipologia);
    assert.ok(s && s.chiave === "LUCILLA", m.tipologia);
  }
  const s = schedaCliente("LUCILLA_PARETE_SINGOLA")!;
  assert.equal(s.pagine.length, 2);
  assert.ok(s.descrizione.includes("EN 13561") && !/mv|lipari/i.test(s.descrizione));
  assert.equal(schedeDelleTipologie(["LUCILLA_ISOLA_DOPPIA", "LUCILLA_PATIO_TRIPLA"]).length, 1);
  const root = new URL("../../public", import.meta.url).pathname;
  for (const f of [s.pdf, ...s.pagine]) assert.ok(fs.existsSync(root + f), f);
});

test("non si confonde con le altre pergole", () => {
  assert.notEqual(schedaCliente("NUVOLA_PARETE")?.chiave, "LUCILLA");
  assert.notEqual(schedaCliente("PANAREA_STANDARD_ISOLA")?.chiave, "LUCILLA");
});
