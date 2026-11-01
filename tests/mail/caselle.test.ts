import { test } from "node:test";
import assert from "node:assert/strict";
import { cifra, decifra, casellaAziendale, casellaPersonale, indirizzoDi, spiegaErrore, portaValida } from "../../src/lib/mail/caselle";

test("la password si cifra e si decifra, mai in chiaro", () => {
  const c = cifra("Segreta!23");
  assert.ok(c.startsWith("v1:") && !c.includes("Segreta"));
  assert.notEqual(cifra("Segreta!23"), c); // ogni volta diversa
  assert.equal(decifra(c), "Segreta!23");
  assert.equal(decifra(c.slice(0, -4) + "AAAA"), null); // manomessa
  assert.equal(decifra("in chiaro"), null);
  assert.equal(decifra(null), null);
});

test("posta aziendale: prima quella del CRM, poi Vercel", () => {
  const env = { SMTP_HOST: "smtp.vercel", SMTP_USER: "v@x.it", SMTP_PASS: "p", SMTP_PORT: "587" };
  assert.deepEqual(casellaAziendale({}, env), { host: "smtp.vercel", porta: 587, utente: "v@x.it", password: "p", mittente: "v@x.it" });
  const crm = { posta_utente: "crm@gruppopec.com", posta_password: cifra("q") };
  assert.deepEqual(casellaAziendale(crm, env), { host: "mail.gruppopec.com", porta: 465, utente: "crm@gruppopec.com", password: "q", mittente: "crm@gruppopec.com" });
  assert.equal(casellaAziendale({ posta_utente: "crm@x.it", posta_password: "rovinata" }, {})?.utente, undefined);
  assert.equal(casellaAziendale({}, {}), null);
});

test("casella personale: basta la password, server e porta da quella aziendale", () => {
  const az = { host: "mail.gruppopec.com", porta: 465, utente: "crm@gruppopec.com", password: "x", mittente: "crm@gruppopec.com" };
  const u = { nome: "Marco Piccatti", email: "marco.piccatti@gruppopec.com", smtpUtente: null, smtpPassword: cifra("m"), smtpHost: null, smtpPorta: null };
  assert.deepEqual(casellaPersonale(u, az), { host: "mail.gruppopec.com", porta: 465, utente: "marco.piccatti@gruppopec.com", password: "m", mittente: "Marco Piccatti <marco.piccatti@gruppopec.com>" });
  assert.equal(casellaPersonale({ ...u, smtpUtente: "m@altro.it", smtpHost: "smtp.altro.it", smtpPorta: 587 }, az)?.host, "smtp.altro.it");
  assert.equal(casellaPersonale({ ...u, smtpPassword: null }, az), null);
  assert.equal(casellaPersonale(u, null)?.host, "mail.gruppopec.com");
});

test("piccoli aiuti", () => {
  assert.equal(indirizzoDi("Gruppo P&C <crm@x.it>"), "crm@x.it");
  assert.equal(indirizzoDi("crm@x.it"), "crm@x.it");
  assert.equal(indirizzoDi(""), null);
  assert.equal(portaValida("587"), 587);
  assert.equal(portaValida("abc"), null);
  assert.equal(spiegaErrore("Invalid login: 535 Incorrect authentication data"), "email o password della casella non corrette");
  assert.match(spiegaErrore("getaddrinfo ENOTFOUND mail.x.it"), /non trovato/);
});
