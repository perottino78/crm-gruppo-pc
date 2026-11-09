import { test } from "node:test";
import assert from "node:assert/strict";
import { statoConsegna } from "../../src/lib/commesse";

const oggi = new Date("2026-11-09T10:00:00Z");
test("consegna: vuota, scaduta, vicina, lontana, lavoro finito", () => {
  assert.equal(statoConsegna(null, "IN_CORSO", oggi).testo, "—");
  const scaduta = statoConsegna(new Date("2026-10-31T12:00:00Z"), "POSA", oggi);
  assert.ok(scaduta.testo.includes("scaduta") && scaduta.cls.includes("red"));
  assert.ok(statoConsegna(new Date("2026-11-14T12:00:00Z"), "POSA", oggi).cls.includes("amber"));
  assert.ok(statoConsegna(new Date("2026-12-30T12:00:00Z"), "POSA", oggi).cls.includes("green"));
  const finita = statoConsegna(new Date("2026-10-31T12:00:00Z"), "LAVORI_ESEGUITI", oggi);
  assert.equal(finita.testo, "31/10/26");
});
