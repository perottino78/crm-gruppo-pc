import { test } from "node:test";
import assert from "node:assert/strict";
import { capisciErrore, alternative, consiglio, usaSsl, chiaveTentativo } from "../../src/lib/mail/diagnosi";

const c = { host: "mail.gruppopec.com", porta: 465, utente: "crm@gruppopec.com", password: "x", mittente: "crm@gruppopec.com" };

test("riconosce i problemi tipici degli hosting di posta", () => {
  assert.deepEqual(capisciErrore("Hostname/IP does not match certificate's altnames: Host: mail.gruppopec.com. is not in the cert's altnames: DNS:srv12.hostingprovider.it, DNS:*.hostingprovider.it"),
    { tipo: "NOME_CERTIFICATO", nomi: ["srv12.hostingprovider.it"] });
  assert.deepEqual(capisciErrore("Hostname/IP does not match certificate's altnames: IP: 1.2.3.4 is not in the cert's list:  [certificato: DNS:mail.provider.net]"), { tipo: "NOME_CERTIFICATO", nomi: ["mail.provider.net"] });
  assert.equal(capisciErrore("self-signed certificate in certificate chain").tipo, "CERTIFICATO");
  assert.equal(capisciErrore("unable to verify the first certificate").tipo, "CERTIFICATO");
  assert.equal(capisciErrore("certificate has expired").tipo, "CERTIFICATO");
  assert.equal(capisciErrore("C03C:error:0A00010B:SSL routines:tls_validate_record_header:wrong version number").tipo, "MODO");
  assert.equal(capisciErrore("Greeting never received").tipo, "MODO");
  assert.equal(capisciErrore("Invalid login: 535 Incorrect authentication data").tipo, "PASSWORD");
  assert.equal(capisciErrore("getaddrinfo ENOTFOUND mail.gruppopec.con").tipo, "RETE");
});

test("cosa provare dopo un errore", () => {
  const provate = new Set([chiaveTentativo(c)]);
  assert.deepEqual(alternative(c, { tipo: "NOME_CERTIFICATO", nomi: ["srv12.hostingprovider.it"] }, provate, false).map((x) => x.host), ["srv12.hostingprovider.it"]);
  assert.deepEqual(alternative(c, { tipo: "NOME_CERTIFICATO", nomi: ["srv12.hostingprovider.it"] }, provate, true).map((x) => `${x.host} ${!!x.accettaCertificato}`), ["srv12.hostingprovider.it false", "mail.gruppopec.com true"]);
  assert.deepEqual(alternative(c, { tipo: "MODO" }, provate, false).map((x) => `${x.porta} ${usaSsl(x)}`), ["465 false", "587 false"]);
  assert.deepEqual(alternative({ ...c, porta: 587 }, { tipo: "MODO" }, new Set(), false).map((x) => `${x.porta} ${usaSsl(x)}`), ["587 true", "465 true"]);
  assert.deepEqual(alternative(c, { tipo: "CERTIFICATO" }, provate, false), []);
  assert.equal(alternative(c, { tipo: "CERTIFICATO" }, provate, true)[0].accettaCertificato, true);
  assert.deepEqual(alternative(c, { tipo: "PASSWORD" }, provate, true), []);
});

test("consigli in parole semplici", () => {
  assert.match(consiglio({ tipo: "CERTIFICATO" }, false), /collega comunque/);
  assert.match(consiglio({ tipo: "PASSWORD" }, false), /password/);
  assert.equal(usaSsl({ porta: 465 }), true);
  assert.equal(usaSsl({ porta: 587 }), false);
  assert.equal(usaSsl({ porta: 465, sicura: false }), false);
});
