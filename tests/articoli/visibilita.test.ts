import { test } from "node:test";
import assert from "node:assert/strict";
import { categoriaVisibile, testoVisibilita, pulisciToken, tokenDi } from "../../src/lib/articoli/visibilita";

test("vuoto = tutti; altrimenti basta il ruolo o l'ufficio", () => {
  assert.equal(categoriaVisibile([], { ruolo: "TECNICO" }), true);
  assert.equal(categoriaVisibile(["RUOLO:TECNICO"], { ruolo: "TECNICO" }), true);
  assert.equal(categoriaVisibile(["RUOLO:TECNICO"], { ruolo: "COMMERCIALE" }), false);
  assert.equal(categoriaVisibile(["UFFICIO:MAGAZZINO"], { ruolo: "AMMINISTRATIVO", ufficio: "MAGAZZINO" }), true);
  assert.equal(categoriaVisibile(["UFFICIO:MAGAZZINO", "RUOLO:POSATORE"], { ruolo: "POSATORE" }), true);
});
test("token e testi", () => {
  assert.deepEqual(tokenDi({ ruolo: "TECNICO", ufficio: "POSA" }), ["RUOLO:TECNICO", "UFFICIO:POSA"]);
  assert.equal(testoVisibilita([]), "Tutti");
  assert.equal(testoVisibilita(["RUOLO:TECNICO", "UFFICIO:ORDINI"]), "Tecnici, Ufficio ordini");
  assert.deepEqual(pulisciToken(["RUOLO:TECNICO", "x", "RUOLO:TECNICO"]), ["RUOLO:TECNICO"]);
});
