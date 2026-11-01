import { test } from "node:test";
import assert from "node:assert/strict";
import { soloAttivi, statoUtente, STATI_UTENTE, totaleCollegati } from "../../src/lib/utenti/stato";

test("tendine: solo chi è attivo, più chi è già assegnato", () => {
  const l = [{ id: "a", stato: "ATTIVO" }, { id: "p", stato: "PAUSA" }, { id: "d", stato: "DISATTIVATO" }, { id: "x" }];
  assert.deepEqual(soloAttivi(l).map((u) => u.id), ["a", "x"]);
  assert.deepEqual(soloAttivi(l, "d").map((u) => u.id), ["a", "d", "x"]);
  assert.deepEqual(soloAttivi(l, null).map((u) => u.id), ["a", "x"]);
});

test("stati e conteggi", () => {
  assert.deepEqual(STATI_UTENTE.map((s) => s.chiave), ["ATTIVO", "PAUSA", "DISATTIVATO"]);
  assert.equal(statoUtente("PAUSA").nome, "In pausa");
  assert.equal(statoUtente("boh").chiave, "ATTIVO");
  assert.equal(totaleCollegati({ clienti: 0, offerte: 2, lead: 1 }), 3);
  assert.equal(totaleCollegati({}), 0);
});
