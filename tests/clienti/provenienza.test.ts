import { test } from "node:test";
import assert from "node:assert/strict";
import { provenienzaDaFonte, whereFiltriClienti, filtriCampagnaAttivi, telefonoInternazionale, nomeCognome, rigaCsv, NESSUNA } from "../../src/lib/clienti/provenienza";

test("ogni fonte finisce nella provenienza giusta", () => {
  assert.equal(provenienzaDaFonte("facebook"), "FACEBOOK");
  assert.equal(provenienzaDaFonte("fb"), "FACEBOOK");
  assert.equal(provenienzaDaFonte("ig"), "INSTAGRAM");
  assert.equal(provenienzaDaFonte("instagram"), "INSTAGRAM");
  assert.equal(provenienzaDaFonte("simulatore_web"), "SIMULATORE WEB");
  assert.equal(provenienzaDaFonte("google-ads"), "GOOGLE");
  assert.equal(provenienzaDaFonte("Fiera Carmagnola 2026"), "FIERA");
  assert.equal(provenienzaDaFonte("passa parola"), "PASSAPAROLA");
  assert.equal(provenienzaDaFonte("telefono"), "TELEFONO");
  assert.equal(provenienzaDaFonte("sito"), "WEB");
  assert.equal(provenienzaDaFonte("CLIENTI PER TE"), "CLIENTI PER TE");
  assert.equal(provenienzaDaFonte("volantino_rosta"), "VOLANTINO ROSTA"); // sorgente nuova: resta riconoscibile
  assert.equal(provenienzaDaFonte(""), "NON INDICATA");
  assert.equal(provenienzaDaFonte(null), "NON INDICATA");
});

test("filtri campagne", () => {
  assert.deepEqual(whereFiltriClienti({ provenienza: "FIERA" }), [{ origine: "FIERA" }]);
  assert.deepEqual(whereFiltriClienti({ stato: "CALDO (interessato)" }), [{ statoLead: "CALDO (interessato)" }]);
  assert.deepEqual(whereFiltriClienti({ commerciale: NESSUNA }), [{ responsabileId: null }]);
  assert.equal(whereFiltriClienti({ provenienza: NESSUNA })[0].OR?.length, 3);
  assert.equal(whereFiltriClienti({ brand: "Tutti", paese: "Tutti" }).length, 0);
  assert.equal(whereFiltriClienti({ q: "rossi", comune: "Rosta" }).length, 2);
  const da = new Date("2026-01-01T00:00:00Z");
  assert.deepEqual(whereFiltriClienti({}, da, null), [{ createdAt: { gte: da } }]);
  assert.equal(filtriCampagnaAttivi({ q: "x" }), false);
  assert.equal(filtriCampagnaAttivi({ stato: "VISITATO" }), true);
});

test("esportazione per Facebook", () => {
  assert.equal(telefonoInternazionale("347 013 6795"), "+393470136795");
  assert.equal(telefonoInternazionale("+39 347 0136795"), "+393470136795");
  assert.equal(telefonoInternazionale("0039 011 1234567"), "+390111234567");
  assert.equal(telefonoInternazionale("393470136795"), "+393470136795");
  assert.equal(telefonoInternazionale(""), "");
  assert.deepEqual(nomeCognome("Rossi Mario"), { nome: "Mario", cognome: "Rossi" });
  assert.deepEqual(nomeCognome("EDIL ROSTA SRL", null, null), { nome: "ROSTA SRL", cognome: "EDIL" });
  assert.deepEqual(nomeCognome("x", "Anna", "Bianchi"), { nome: "Anna", cognome: "Bianchi" });
  assert.equal(rigaCsv(["a;b", 'di "lui"', null, 3], ";"), '"a;b";"di ""lui""";;3');
});
