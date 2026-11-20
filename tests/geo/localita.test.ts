import test from "node:test";
import assert from "node:assert/strict";
import { siglaDaTesto, provinciaDaCap, provinciaDaComune, provinciaDelContatto, scritturePerRicerca, normalizza } from "../../src/lib/geo/localita";

test("sigla dalla scrittura della provincia", () => {
  assert.equal(siglaDaTesto("TO"), "TO");
  assert.equal(siglaDaTesto(" (to) "), "TO");
  assert.equal(siglaDaTesto("Torino"), "TO");
  assert.equal(siglaDaTesto("Provincia di Cuneo"), "CN");
  assert.equal(siglaDaTesto("Reggio Emilia"), "RE");
  assert.equal(siglaDaTesto("Monza"), "MB");
  assert.equal(siglaDaTesto("Forlì-Cesena"), "FC");
  assert.equal(siglaDaTesto("Bolzano"), "BZ");
  assert.equal(siglaDaTesto("XX"), null);
  assert.equal(siglaDaTesto(""), null);
});

test("provincia dal CAP, anche senza lo zero davanti", () => {
  assert.equal(provinciaDaCap("10124"), "TO");
  assert.equal(provinciaDaCap("10090"), "TO");   // Rosta
  assert.equal(provinciaDaCap("00118"), "RM");
  assert.equal(provinciaDaCap("118"), null);
  assert.equal(provinciaDaCap("0118"), "RM");    // Excel ha tolto lo zero
  assert.equal(provinciaDaCap("20121"), "MI");
  assert.equal(provinciaDaCap("12100"), "CN");
  assert.equal(provinciaDaCap("abc"), null);
});

test("provincia dal comune", () => {
  assert.equal(provinciaDaComune("Rosta"), "TO");
  assert.equal(provinciaDaComune("ROSTA"), "TO");
  assert.equal(provinciaDaComune("Forlì"), "FC");
  assert.equal(provinciaDaComune("Rosta (TO)"), "TO");
  assert.equal(provinciaDaComune("Avigliana TO"), "TO");
  assert.equal(provinciaDaComune("Castro"), null, "stesso nome in due province: non si indovina");
  assert.equal(provinciaDaComune("Postopignoto"), null);
});

test("la provincia del contatto: scritta, poi CAP, poi comune", () => {
  assert.equal(provinciaDelContatto({ provincia: "Cuneo", comune: "Rosta", cap: "10090" }), "CN");
  assert.equal(provinciaDelContatto({ comune: "Rosta", cap: "12100" }), "CN");
  assert.equal(provinciaDelContatto({ comune: "Rosta" }), "TO");
  assert.equal(provinciaDelContatto({}), null);
});

test("come cercare una provincia nel database", () => {
  assert.deepEqual(scritturePerRicerca(["TO"]).sort(), ["TO", "Torino"].sort());
  assert.ok(scritturePerRicerca(["BZ"]).includes("Bolzano"));
  assert.ok(scritturePerRicerca(["BZ"]).includes("Bozen"));
  assert.equal(normalizza("Forlì-Cesena"), "forli cesena");
});
