import { test } from "node:test";
import assert from "node:assert/strict";
import { leggiCsv, righeDaCsv, classifica, riepilogo, modelloCsv, normalizzaTel, telefoniDi, type Esistente } from "../../src/lib/lead/importa";

test("legge il CSV con punto e virgola, virgolette e a capo dentro la cella", () => {
  const t = leggiCsv('Nome;Note\r\n"Rossi; Mario";"riga 1\nriga 2"\r\nBianchi;ok\r\n');
  assert.deepEqual(t, [["Nome", "Note"], ["Rossi; Mario", "riga 1\nriga 2"], ["Bianchi", "ok"]]);
});
test("riconosce da solo la virgola e la tabulazione", () => {
  assert.deepEqual(leggiCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(leggiCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
});
test("il modello scaricato si rilegge senza errori", () => {
  const l = righeDaCsv(modelloCsv(["P&C", "Solaris"]));
  assert.equal(l.errore, undefined);
  assert.equal(l.righe.length, 2);
  assert.equal(l.righe[0].nome, "Mario Rossi");
  assert.equal(l.righe[1].marchio, "Solaris");
  assert.ok(l.colonneTrovate.includes("provenienza") && l.colonneTrovate.includes("note"));
});
test("colonne con nomi diversi e cognome separato", () => {
  const l = righeDaCsv("Cognome;Nome;Cellulare;E-mail;Città\nRossi;Mario;333 111 2222;m@x.it;Rosta");
  assert.equal(l.righe[0].nome, "Mario Rossi");
  assert.equal(l.righe[0].telefono, "333 111 2222");
  assert.equal(l.righe[0].comune, "Rosta");
});
test("senza colonna nome: errore chiaro", () => {
  assert.ok(righeDaCsv("Telefono;Email\n333;a@b.it").errore?.includes("nome"));
});
test("telefoni: prefisso +39 ignorato, più numeri nella stessa cella", () => {
  assert.equal(normalizzaTel("+39 333 123 4567"), "3331234567");
  assert.equal(normalizzaTel("0039 333-123-4567"), "3331234567");
  assert.deepEqual(telefoniDi("333 1234567 / 011 987654"), ["3331234567", "011987654"]);
});
test("controlli: errori, doppioni nel file, lead e clienti già in ONE", () => {
  const esistenti: Esistente[] = [
    { tipo: "LEAD", id: "L1", nome: "Verdi Luca", telefoni: ["3470000001"], emails: ["luca@x.it"], info: "arrivato 3 giorni fa" },
    { tipo: "CLIENTE", id: "C1", nome: "Neri Paola", telefoni: ["0119999999"], emails: [] },
  ];
  const l = righeDaCsv([
    "Nome;Telefono;Email",
    "Nuovo Uno;333 1111111;uno@x.it",       // nuovo
    ";333 2222222;;",                        // errore: manca il nome
    "Senza Contatti;;",                      // errore
    "Doppia Riga;+39 333 1111111;;",         // doppio nel file (riga 2)
    "Luca Verdi;;LUCA@X.IT",                 // doppio lead per email
    "Paola Neri;011 9999999;",               // doppio cliente per telefono
    "Solo Email;;solo@x.it",                 // nuovo
  ].join("\n"));
  const e = classifica(l.righe, esistenti);
  assert.deepEqual(e.map((x) => x.stato), ["NUOVO", "ERRORE", "ERRORE", "DOPPIO_FILE", "DOPPIO_LEAD", "DOPPIO_CLIENTE", "NUOVO"]);
  assert.deepEqual(riepilogo(e), { totale: 7, nuovi: 2, doppiFile: 1, doppiLead: 1, doppiClienti: 1, errori: 2 });
  assert.ok(e[4].motivo?.includes("Verdi Luca"));
});
