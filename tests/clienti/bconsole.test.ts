import { test } from "node:test";
import assert from "node:assert/strict";
import { convertiAnagrafica, provenienza, marchio, usernameCommerciale, dataRoma, normalizzaTelefono, chiaveNomeCliente, indiceClienti, completaCliente } from "../../src/lib/clienti/bconsole";

test("provenienza per le campagne", () => {
  assert.equal(provenienza({ origine: "FACEBOOK" }), "FACEBOOK");
  assert.equal(provenienza({ origine: "Facebook/Web - Bonus Fiscale" }), "FACEBOOK - BONUS FISCALE");
  assert.equal(provenienza({ origine: "PASSA PAROLA" }), "PASSAPAROLA (PASSA PAROLA)");
  assert.equal(provenienza({ origine: "Fiera" }), "FIERA");
  assert.equal(provenienza({ origine: "QUOTALO" }), "QUOTALO");
  assert.equal(provenienza({ origine: "", tag: ["META PERGOLE P&C"] }), "FACEBOOK");
  assert.equal(provenienza({ origine: null, note: "Richiesta web del 05/12/2024" }), "WEB");
  assert.equal(provenienza({}), "NON INDICATA");
});

test("marchio: Solaris, Purafonte, altrimenti P&C", () => {
  assert.equal(marchio({ tag: ["META PREVENTIVO ONLINE SOLARIS"] }), "Solaris");
  assert.equal(marchio({ tag: ["PURA FONTE (TUTTI)"] }), "Purafonte");
  assert.equal(marchio({ venditore: "GVI" }), "Solaris");
  assert.equal(marchio({ venditore: "IPU" }), "Purafonte");
  assert.equal(marchio({ tag: ["META TENDE DA SOLE P&C"] }), "P&C");
  assert.equal(marchio({}), "P&C");
});

test("commerciale dalla sigla, se non c'è va a Ugo", () => {
  assert.equal(usernameCommerciale({ venditore: "MPI" }), "mpiccatti");
  assert.equal(usernameCommerciale({ venditore: "MZ" }), "uperottino");
  assert.equal(usernameCommerciale({ venditore: "IP&" }), "uperottino");
  assert.equal(usernameCommerciale({}), "uperottino");
});

test("data BConsole in ora di Roma", () => {
  assert.equal(dataRoma("26/10/2026", "12:31"), "2026-10-26T12:31");
  assert.equal(dataRoma("02/07/2026", null), "2026-07-02T12:00");
  assert.equal(dataRoma("", ""), null);
});

test("telefono e nome normalizzati", () => {
  assert.equal(normalizzaTelefono("+39 347 013 6795"), "3470136795");
  assert.equal(normalizzaTelefono("333-7370376"), "3337370376");
  assert.equal(chiaveNomeCliente("CEPARANO ARNALDO"), chiaveNomeCliente("Arnaldo Ceparano"));
});

test("conversione di un lead", () => {
  const d = convertiAnagrafica({ idAna: "33782", categoria: "Lead", ragioneSociale: "BORI BARBARA", telefono: "3427681107", cellulare: "3427681107", email: "Barbara.Bori@gmail.com", cap: "20124 Milano MI", comune: "milano", origine: "QUOTALO", stato: "Ricontattare", tag: ["META VETRATE P&C"], note: "CAMPAGNA VETRATE<br />Si trova in lombardia?SI" });
  assert.equal(d.nome, "Bori Barbara");
  assert.equal(d.email, "barbara.bori@gmail.com");
  assert.equal(d.cellulare, null); // uguale al telefono
  assert.equal(d.cap, "20124");
  assert.equal(d.comune, "Milano");
  assert.equal(d.statoLead, "Ricontattare");
  assert.equal(d.bconsoleId, "33782");
  assert.equal(d.tag, "META VETRATE P&C");
  assert.ok(d.noteLibere.includes("CAMPAGNA VETRATE\nSi trova in lombardia?SI"));
  assert.ok(d.noteLibere.includes("anagrafica n. 33782"));
});

test("riconosce lo stesso cliente e completa solo i vuoti", () => {
  const { trova, aggiungi } = indiceClienti([{ id: "c1", nome: "Arnaldo Ceparano", telefono: "333 7370376", cellulare: null, email: null, piva: null, codiceFiscale: null, bconsoleId: null }]);
  const d = convertiAnagrafica({ ragioneSociale: "Ceparano Arnaldo", telefono: "+393337370376", email: "a@b.it", origine: "Fiera" });
  assert.equal(trova(d)?.id, "c1");
  assert.equal(trova(convertiAnagrafica({ ragioneSociale: "Mario", telefono: "111111111" })), null); // solo nome: non basta
  aggiungi({ id: "n1", nome: "Mario", telefono: "111111111", cellulare: null, email: null, piva: null, codiceFiscale: null, bconsoleId: "9" });
  assert.equal(trova(convertiAnagrafica({ idAna: "9", ragioneSociale: "Altro" }))?.id, "n1");
  const extra = completaCliente({ nome: "Arnaldo Ceparano", telefono: "333 7370376", email: null, origine: "UFFICIO" }, d);
  assert.equal(extra.email, "a@b.it");
  assert.equal(extra.origine, undefined); // già scritta a mano
  assert.equal(extra.telefono, undefined);
});
