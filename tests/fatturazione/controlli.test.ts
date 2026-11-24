import { test } from "node:test";
import assert from "node:assert/strict";
import { pivaValida, codiceFiscaleValido, erroreCodiceDestinatario, pecValida } from "../../src/lib/fatturazione/controlli";

test("partita IVA: cifra di controllo", () => {
  assert.ok(pivaValida("10741080013"), "P&C");
  assert.ok(pivaValida("IT10741080013"));
  assert.ok(pivaValida("01373680030"));
  assert.ok(!pivaValida("10741080014"), "cifra di controllo sbagliata");
  assert.ok(!pivaValida("1074108001"), "10 cifre");
});

test("codice fiscale: lettera di controllo e società", () => {
  assert.ok(codiceFiscaleValido("RSSMRA85T10A562S"), "esempio classico");
  assert.ok(!codiceFiscaleValido("RSSMRA85T10A562X"));
  assert.ok(codiceFiscaleValido("10741080013"), "società = come la partita IVA");
  assert.ok(!codiceFiscaleValido("12345678901"));
});

test("codice destinatario e PEC", () => {
  assert.equal(erroreCodiceDestinatario(""), null);
  assert.equal(erroreCodiceDestinatario("0000000"), null);
  assert.equal(erroreCodiceDestinatario("8CQGKGJ"), null);
  assert.match(erroreCodiceDestinatario("UF1234") ?? "", /ente pubblico/);
  assert.match(erroreCodiceDestinatario("ABC") ?? "", /7 caratteri/);
  assert.ok(pecValida("") && pecValida("a@pec.it") && !pecValida("a@b"));
});
