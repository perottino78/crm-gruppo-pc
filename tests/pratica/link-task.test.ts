import { test } from "node:test";
import assert from "node:assert/strict";
import { linkTask, azioneTask } from "../../src/lib/pratica/link-task";

test("il task del rilievo porta al caricamento del rilievo", () => {
  assert.equal(linkTask("c1", "RILIEVO"), "/commesse/c1?passo=RILIEVO#rilievo");
  assert.equal(azioneTask("RILIEVO"), "📏 Carica il rilievo");
});

test("il task degli ordini porta a materiale e ordini, gli altri in cima alla pratica", () => {
  assert.equal(linkTask("c1", "ORDINI"), "/commesse/c1?passo=MATERIALE#evasione");
  assert.equal(linkTask("c1", "POSA_APP"), "/commesse/c1");
  assert.equal(linkTask("c1", null), "/commesse/c1");
  assert.equal(azioneTask("POSA_APP"), null);
});
