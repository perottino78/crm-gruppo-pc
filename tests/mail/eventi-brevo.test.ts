import { test } from "node:test";
import assert from "node:assert/strict";
import { azioneBrevo } from "../../src/lib/mail/eventi-brevo";
import { mittenteCampagna } from "../../src/lib/campagne/motore";

test("azioneBrevo: rimbalzi permanenti e temporanei, con il codice dell'invio", () => {
  assert.deepEqual(azioneBrevo({ event: "hard_bounce", email: "Mario@X.it", "X-Mailin-custom": "c-abc123", reason: "user unknown" }),
    { tipo: "RIMBALZO", email: "mario@x.it", codice: "c-abc123", permanente: true, motivo: "indirizzo inesistente o rifiutato (Brevo): user unknown" });
  const s = azioneBrevo({ event: "soft_bounce", email: "a@b.it" });
  assert.equal(s.tipo, "RIMBALZO");
  assert.equal(s.tipo === "RIMBALZO" && s.permanente, false);
  assert.equal(azioneBrevo({ event: "blocked", email: "a@b.it" }).tipo, "RIMBALZO");
  assert.equal(azioneBrevo({ event: "invalid_email", email: "a@b.it" }).tipo, "RIMBALZO");
});

test("azioneBrevo: disiscrizione e spam; il resto non fa niente; codici strani ignorati", () => {
  assert.equal(azioneBrevo({ event: "unsubscribed", email: "a@b.it" }).tipo, "DISISCRITTO");
  assert.equal(azioneBrevo({ event: "spam", email: "a@b.it" }).tipo, "DISISCRITTO");
  assert.deepEqual(azioneBrevo({ event: "delivered", email: "a@b.it" }), { tipo: "NIENTE" });
  assert.deepEqual(azioneBrevo({ event: "hard_bounce", email: "non-email" }), { tipo: "NIENTE" });
  const x = azioneBrevo({ event: "hard_bounce", email: "a@b.it", "X-Mailin-custom": "x; DROP" });
  assert.equal(x.tipo === "RIMBALZO" && x.codice, null);
});

test("mittenteCampagna: solo Solaris → mittente Solaris, altrimenti P&C", () => {
  assert.match(mittenteCampagna(["Solaris"]), /solarisfotovoltaico\.com/);
  assert.match(mittenteCampagna([]), /gruppopec\.com/);
  assert.match(mittenteCampagna(["Solaris", "P&C"]), /gruppopec\.com/);
});
