import { test } from "node:test";
import assert from "node:assert/strict";
import { rilieviDoppioni, linkProgetto } from "../../src/lib/calendario/rilievo-progetto";

const t = new Date("2026-11-20T09:00:00Z");
test("il rilievo che doppia l'appuntamento collegato non si mostra", () => {
  const app = [{ tipo: "SOPRALLUOGO", commessaId: "c1", utenteId: "u1", dataOra: t, stato: "PROGRAMMATO" }];
  const ril = [
    { id: "r1", commessaId: "c1", tecnicoId: "u1", dataOra: t }, // doppione
    { id: "r2", commessaId: "c1", tecnicoId: "u2", dataOra: t }, // altro tecnico
    { id: "r3", commessaId: "c2", tecnicoId: "u1", dataOra: t }, // altra pratica
  ];
  assert.deepEqual([...rilieviDoppioni(app, ril)], ["r1"]);
  // appuntamento libero, annullato o non di rilievo: il rilievo si vede
  assert.equal(rilieviDoppioni([{ ...app[0], commessaId: null }], ril).size, 0);
  assert.equal(rilieviDoppioni([{ ...app[0], stato: "ANNULLATO" }], ril).size, 0);
  assert.equal(rilieviDoppioni([{ ...app[0], tipo: "COMMERCIALE" }], ril).size, 0);
});

test("link al progetto: il rilievo apre il passo del rilievo", () => {
  assert.equal(linkProgetto("c1", "SOPRALLUOGO"), "/commesse/c1?passo=RILIEVO#rilievo");
  assert.equal(linkProgetto("c1", "COMMERCIALE"), "/commesse/c1");
});
