import { test } from "node:test";
import assert from "node:assert/strict";
import { codiceFirmato, leggiCodice, conTracciamento, conPreheader, testoDaHtml, htmlCampagna, linkSicuro } from "../../src/lib/mail/tracciamento";

const B = "https://crm.test";

test("codici firmati: nessuno può falsare i conteggi", () => {
  const c = codiceFirmato("c-abc123xyz");
  assert.deepEqual(leggiCodice(c), { tipo: "c", id: "abc123xyz" });
  assert.equal(leggiCodice(c.replace(/.$/, (x) => (x === "0" ? "1" : "0"))), null);
  assert.equal(leggiCodice("c-abc123xyz"), null);
  assert.equal(leggiCodice("x-abc123xyz.0123456789abcdef"), null);
  assert.equal(leggiCodice(codiceFirmato("l-lead00001"))?.tipo, "l");
});

test("tracciamento: link al contatore, disiscrizione e mailto intatti, pixel in fondo", () => {
  const html = `<html><body><a href="https://gruppopec.com/promo?a=1&amp;b=2">Vai</a> <a href='mailto:x@y.it'>scrivi</a> <a href="https://crm.test/api/disiscrizione?c=1">esci</a></body></html>`;
  const t = conTracciamento(html, B, "c-abc123xyz");
  assert.match(t, /href="https:\/\/crm\.test\/api\/traccia\/c-abc123xyz\.[0-9a-f]{16}\?u=https%3A%2F%2Fgruppopec\.com%2Fpromo%3Fa%3D1%26b%3D2"/);
  assert.ok(t.includes("href='mailto:x@y.it'") && t.includes('href="https://crm.test/api/disiscrizione?c=1"'));
  assert.match(t, /<img src="https:\/\/crm\.test\/api\/traccia\/c-abc123xyz\.[0-9a-f]{16}" width="1"[^>]*\/><\/body>/);
  assert.ok(conTracciamento("<p>ciao</p>", B, "c-abc123xyz").startsWith("<p>ciao</p><img"));
  assert.ok(linkSicuro("https://a.it/x") && !linkSicuro("javascript:alert(1)") && !linkSicuro(null));
});

test("preheader nascosto subito dopo <body>", () => {
  const h = conPreheader('<html><body style="x"><p>Testo</p></body></html>', "Sconto <50%> fino a marzo");
  assert.match(h, /<body style="x"><div style="display:none[^"]*">Sconto &lt;50%&gt; fino a marzo/);
  assert.equal(conPreheader("<p>x</p>", ""), "<p>x</p>");
  assert.ok(conPreheader("<p>x</p>", "Ciao").startsWith('<div style="display:none'));
});

test("template HTML: disiscrizione sempre presente e versione di solo testo", () => {
  const conSegnaposto = htmlCampagna('<body><a href="{disiscrizione}">via</a></body>', "https://crm/api/disiscrizione?c=1");
  assert.ok(conSegnaposto.includes('href="https://crm/api/disiscrizione?c=1"') && !conSegnaposto.includes("Disiscriviti"));
  const senza = htmlCampagna("<html><body><h1>Promo</h1></body></html>", "https://crm/esci");
  assert.match(senza, /Disiscriviti<\/a>\.<\/p><\/body>/);
  const t = testoDaHtml('<html><head><style>p{}</style></head><body><h1>Ciao Mario</h1><p>Prezzi &amp; sconti</p><ul><li>uno</li></ul><a href="https://x.it/p">Scopri</a></body></html>');
  assert.equal(t, "Ciao Mario\nPrezzi & sconti\n• uno\nScopri (https://x.it/p)");
});
