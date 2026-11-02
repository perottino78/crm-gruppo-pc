import { test } from "node:test";
import assert from "node:assert/strict";
import { firmaPredefinita, firmaDi, firmaHtml, firmaTesto, emailOfferta, indirizzi, testoOffertaPredefinito, oggettoOffertaPredefinito, qualifica } from "../../src/lib/mail/firma";
import { codiceOfferta, leggiCodiceOfferta, linkOfferta } from "../../src/lib/mail/link-offerta";

const marco = { nome: "Marco Piccatti", ruolo: "COMMERCIALE", ufficio: "COMMERCIALE", telefono: "333 1234567", email: "marco.piccatti@gruppopec.com" };

test("firma pronta con nome, qualifica, telefono, email e sito", () => {
  const f = firmaPredefinita(marco);
  const righe = f.split("\n");
  assert.equal(righe[0], "Marco Piccatti");
  assert.equal(righe[1], "Consulente commerciale");
  assert.ok(f.includes("Cell. 333 1234567"));
  assert.ok(f.includes("marco.piccatti@gruppopec.com"));
  assert.ok(f.includes("www.gruppopec.com"));
  assert.ok(firmaPredefinita(marco, "Solaris").includes("Gruppo P&C · Solaris"));
});

test("senza telefono la riga del cellulare non c'è", () => {
  assert.ok(!firmaPredefinita({ nome: "Ugo", ruolo: "AMMINISTRATORE" }).includes("Cell."));
  assert.equal(qualifica({ ruolo: "TECNICO", ufficio: null }), "Ufficio tecnico");
});

test("firma salvata prima di quella pronta", () => {
  assert.equal(firmaDi({ ...marco, firmaEmail: "  Marco\nVenditore  " }), "Marco\nVenditore");
  assert.equal(firmaDi({ ...marco, firmaEmail: "   " }), firmaPredefinita(marco));
});

test("firma HTML: nome in grassetto, link cliccabili, testo protetto", () => {
  const h = firmaHtml("Marco <b>\nConsulente\nmarco@gruppopec.com\nwww.gruppopec.com\nCell. 333 1234567", { colore: "#16A34A" });
  assert.ok(h.includes("Marco &lt;b&gt;"));
  assert.ok(h.includes('href="mailto:marco@gruppopec.com"'));
  assert.ok(h.includes('href="https://www.gruppopec.com"'));
  assert.ok(h.includes('href="tel:3331234567"'));
  assert.ok(h.includes("#16A34A"));
});

test("firma già in HTML resta com'è; versione testo senza tag", () => {
  const h = "<table><tr><td><b>Rocco</b><br>Marketing &amp; vendite</td></tr></table>";
  assert.equal(firmaHtml(h), h);
  assert.equal(firmaTesto(h), "Rocco\nMarketing & vendite");
});

test("email dell'offerta: paragrafi, pulsante col link, firma", () => {
  const e = emailOfferta({ testo: "Gentile Mario,\n\nle invio l'offerta.\nA presto", firma: "Marco\nConsulente", link: "https://x.it/offerta/abc.123" });
  assert.ok(e.html.includes("<p style=\"margin:0 0 14px\">Gentile Mario,</p>"));
  assert.ok(e.html.includes("le invio l&#39;offerta.") || e.html.includes("le invio l'offerta.<br>A presto"));
  assert.ok(e.html.includes('href="https://x.it/offerta/abc.123"'));
  assert.ok(e.testo.includes("Vedi e scarica l'offerta: https://x.it/offerta/abc.123"));
  assert.ok(e.testo.endsWith("-- \nMarco\nConsulente"));
  assert.ok(!emailOfferta({ testo: "Ciao", firma: "", link: null }).html.includes("Vedi e scarica"));
});

test("link dell'offerta firmato: id cambiato o firma falsa → rifiutato", () => {
  const c = codiceOfferta("cm123abc");
  assert.equal(leggiCodiceOfferta(c), "cm123abc");
  assert.equal(leggiCodiceOfferta(c.replace("cm123abc", "cm123abd")), null);
  assert.equal(leggiCodiceOfferta("cm123abc.00000000000000000000"), null);
  assert.equal(leggiCodiceOfferta("niente"), null);
  assert.equal(linkOfferta("https://crm.it/", "cm1"), `https://crm.it/offerta/${codiceOfferta("cm1")}`);
});

test("indirizzi scritti a mano", () => {
  assert.deepEqual(indirizzi("a@b.it, C@D.it; sbagliato e@f.com a@b.it"), ["a@b.it", "c@d.it", "e@f.com"]);
  assert.deepEqual(indirizzi(null), []);
});

test("testi di partenza", () => {
  assert.ok(testoOffertaPredefinito({ cliente: "Rossi Mario", numero: "12/2026", oggetto: "fornitura e posa infissi." }).includes("offerta n. 12/2026 per fornitura e posa infissi."));
  assert.ok(testoOffertaPredefinito({ cliente: "Rossi Srl", numero: "1/2026", nomePersona: "Anna" }).startsWith("Gentile Anna,"));
  assert.equal(oggettoOffertaPredefinito("5/2026", "Solaris"), "Offerta n. 5/2026 — Solaris · Gruppo P&C");
  assert.equal(oggettoOffertaPredefinito("5/2026", "P&C"), "Offerta n. 5/2026 — Gruppo P&C");
});
