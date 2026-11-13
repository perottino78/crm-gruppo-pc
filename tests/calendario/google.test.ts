import { test } from "node:test";
import assert from "node:assert/strict";
import { calendariBconsole, proponiAbbinamenti, idGoogleDi, corpoGoogle, daElementoGoogle, daScrivere, azioneGoogle } from "../../src/lib/calendario/googlecal";

const utenti = [{ id: "u1", nome: "Marco Piccatti" }, { id: "u2", nome: "Giordano Rossi" }, { id: "u3", nome: "Ugo Perottino" }];

test("calendariBconsole: solo quelli con «bconsole» nel nome", () => {
  const c = calendariBconsole([{ nome: "Marco Piccatti BCONSOLE finale" }, { nome: "Festività in Italia" }, { nome: "ugo bconsole" }]);
  assert.deepEqual(c.map((x) => x.nome), ["Marco Piccatti BCONSOLE finale", "ugo bconsole"]);
});

test("proponiAbbinamenti: persona dal nome, «finale» vince, scrivi di serie, salvati tenuti", () => {
  const cal = [
    { id: "a", nome: "Marco Piccatti BCONSOLE" }, { id: "b", nome: "Piccatti Marco BCONSOLE finale" },
    { id: "c", nome: "Rossi Giordano BCONSOLE finale" }, { id: "d", nome: "Compleanni" }, { id: "e", nome: "Sconosciuto BCONSOLE" },
  ];
  const p = proponiAbbinamenti(cal, utenti);
  assert.deepEqual(p.map((x) => [x.id, x.utenteId, x.scrivi]), [["a", null, false], ["b", "u1", true], ["c", "u2", true], ["e", null, true]]);
  // un abbinamento fatto a mano resta (anche il nome nuovo arriva da Google)
  const p2 = proponiAbbinamenti([{ id: "e", nome: "Ugo BCONSOLE (nuovo)" }], utenti, [{ id: "e", nome: "x", utenteId: "u3", scrivi: false }]);
  assert.deepEqual(p2, [{ id: "e", nome: "Ugo BCONSOLE (nuovo)", utenteId: "u3", scrivi: false }]);
});

test("idGoogleDi: sempre uguale e solo caratteri ammessi da Google (base32hex)", () => {
  const id = idGoogleDi("APPUNTAMENTO:abc");
  assert.equal(id, idGoogleDi("APPUNTAMENTO:abc"));
  assert.match(id, /^[0-9a-v]{5,1024}$/);
  assert.notEqual(id, idGoogleDi("APPUNTAMENTO:abd"));
});

test("corpoGoogle: ora di Roma, cliente nel titolo, chiave di P&C ONE, impronta stabile", () => {
  const e = { chiave: "APPUNTAMENTO:1", titolo: "Sopralluogo", cliente: "Rossi Mario", inizio: new Date("2026-11-20T09:00:00Z"), fine: new Date("2026-11-20T10:00:00Z"), giornataIntera: false, luogo: "Via Roma 1" };
  const { corpo, impronta } = corpoGoogle(e);
  assert.equal(corpo.summary, "Sopralluogo — Rossi Mario");
  assert.deepEqual(corpo.start, { dateTime: "2026-11-20T09:00:00.000Z", timeZone: "Europe/Rome" });
  assert.deepEqual(corpo.extendedProperties, { private: { one: "APPUNTAMENTO:1" } });
  assert.equal(impronta, corpoGoogle(e).impronta);
  assert.notEqual(impronta, corpoGoogle({ ...e, inizio: new Date("2026-11-20T09:30:00Z") }).impronta);
  const g = corpoGoogle({ ...e, giornataIntera: true, inizio: new Date("2026-11-19T23:00:00Z"), fine: new Date("2026-11-20T23:00:00Z") }).corpo;
  assert.deepEqual(g.start, { date: "2026-11-20" });
  assert.deepEqual(g.end, { date: "2026-11-21" });
});

test("daElementoGoogle: orari, tutto il giorno (mezzanotte di Roma), occupato senza titolo, libero, di P&C ONE", () => {
  const a = daElementoGoogle({ id: "x", etag: '"1"', summary: "Occupato", start: { dateTime: "2026-11-20T10:00:00+01:00" }, end: { dateTime: "2026-11-20T12:00:00+01:00" } })!;
  assert.equal(a.inizio.toISOString(), "2026-11-20T09:00:00.000Z");
  assert.equal(a.fine.toISOString(), "2026-11-20T11:00:00.000Z");
  assert.equal(a.chiaveOne, null);
  const b = daElementoGoogle({ id: "y", start: { date: "2026-11-20" }, end: { date: "2026-11-21" } })!;
  assert.equal(b.giornataIntera, true);
  assert.equal(b.inizio.toISOString(), "2026-11-19T23:00:00.000Z");
  assert.equal(b.titolo, "(occupato)");
  const estate = daElementoGoogle({ id: "z", start: { date: "2026-07-01" } })!;
  assert.equal(estate.inizio.toISOString(), "2026-06-30T22:00:00.000Z");
  assert.equal(daElementoGoogle({ id: "l", transparency: "transparent", start: { dateTime: "2026-11-20T10:00:00Z" } })!.libero, true);
  assert.equal(daElementoGoogle({ id: "o", status: "cancelled", extendedProperties: { private: { one: "APPUNTAMENTO:9" } }, start: { dateTime: "2026-11-20T10:00:00Z" } })!.chiaveOne, "APPUNTAMENTO:9");
  assert.equal(daElementoGoogle({ id: "n" }), null);
});

test("daScrivere: solo appuntamenti e riunioni nati in P&C ONE dopo il collegamento, mai quelli di BConsole", () => {
  const dal = new Date("2026-11-13T10:00:00Z");
  assert.equal(daScrivere({ tipo: "APPUNTAMENTO", creatoIl: new Date("2026-11-13T11:00:00Z"), importato: false }, dal), true);
  assert.equal(daScrivere({ tipo: "RIUNIONE", creatoIl: new Date("2026-11-14T11:00:00Z"), importato: false }, dal), true);
  assert.equal(daScrivere({ tipo: "APPUNTAMENTO", creatoIl: new Date("2026-11-12T11:00:00Z"), importato: false }, dal), false); // già esistente
  assert.equal(daScrivere({ tipo: "APPUNTAMENTO", creatoIl: new Date("2026-11-14T11:00:00Z"), importato: true }, dal), false); // da BConsole
  assert.equal(daScrivere({ tipo: "RILIEVO", creatoIl: new Date("2026-11-14T11:00:00Z"), importato: false }, dal), false);
  assert.equal(daScrivere({ tipo: "APPUNTAMENTO", creatoIl: new Date("2026-11-14T11:00:00Z"), importato: false }, null), false);
});

test("azioneGoogle: vince P&C ONE", () => {
  const base = { annullatoInOne: false, suGoogle: true, etagSalvato: "e1", etagGoogle: "e1", impronta: "i", improntaSalvata: "i" };
  assert.equal(azioneGoogle(base), "NIENTE");
  assert.equal(azioneGoogle({ ...base, suGoogle: false }), "SCRIVI"); // cancellato su Google → si rimette
  assert.equal(azioneGoogle({ ...base, etagGoogle: "e2" }), "SCRIVI"); // spostato su Google → si riporta com'è in P&C ONE
  assert.equal(azioneGoogle({ ...base, impronta: "j" }), "SCRIVI"); // cambiato in P&C ONE
  assert.equal(azioneGoogle({ ...base, annullatoInOne: true }), "CANCELLA");
  assert.equal(azioneGoogle({ ...base, annullatoInOne: true, suGoogle: false, etagSalvato: null }), "NIENTE");
});
