import { test } from "node:test";
import assert from "node:assert/strict";
import { RUOLI_UTENTE, eMarketing, puoMarketing, RUOLI_CREABILI_MARKETING } from "../../src/lib/utenti/stato";
import { scopeClienteWhere, scopeLeadWhere } from "../../src/lib/scope";

test("mansione Marketing: per ruolo o per ufficio, vede tutti i clienti", () => {
  assert.ok(RUOLI_UTENTE.includes("MARKETING"));
  assert.equal(eMarketing({ ruolo: "MARKETING", ufficio: null }), true);
  assert.equal(eMarketing({ ruolo: "TECNICO", ufficio: "MARKETING" }), true);
  assert.equal(eMarketing({ ruolo: "TECNICO", ufficio: "TECNICO" }), false);
  assert.equal(eMarketing(null), false);
  assert.deepEqual(scopeClienteWhere({ id: "r", ruolo: "MARKETING" }), {});
  assert.notDeepEqual(scopeClienteWhere({ id: "r", ruolo: "TECNICO" }), {});
});

test("marketing: pubblicità, listini e nuovi colleghi, ma non amministratori", () => {
  assert.equal(puoMarketing({ ruolo: "AMMINISTRATORE" }), true);
  assert.equal(puoMarketing({ ruolo: "MARKETING" }), true);
  assert.equal(puoMarketing({ ruolo: "TELEFONISTA", ufficio: "MARKETING" }), true);
  assert.equal(puoMarketing({ ruolo: "COMMERCIALE", ufficio: "COMMERCIALE" }), false);
  assert.ok(!RUOLI_CREABILI_MARKETING.includes("AMMINISTRATORE") && !RUOLI_CREABILI_MARKETING.includes("AMMINISTRATIVO"));
  assert.deepEqual(scopeLeadWhere({ id: "r", ruolo: "MARKETING" }), {});
  assert.deepEqual(scopeLeadWhere({ id: "t", ruolo: "TELEFONISTA" }), { OR: [{ telefonistaId: "t" }, { venditoreId: "t", fase: "APPUNTAMENTO_TELEFONICO" }] });
});
