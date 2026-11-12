import { test } from "node:test";
import assert from "node:assert/strict";
import { cercaEventi, coloriPersone, PALETTE_PERSONE, type EventoCal } from "../../src/lib/calendario/eventi";

const ev = (id: string, o: Partial<EventoCal>): EventoCal => ({
  id, tipo: "APPUNTAMENTO", inizio: new Date("2026-11-20T09:00:00Z"), fine: new Date("2026-11-20T10:00:00Z"),
  giornataIntera: false, titolo: "Visita", stato: "PROGRAMMATO", href: "/x", ...o,
});
const E = [
  ev("1", { cliente: "Rossi Mario", luogo: "Via Roma 12, 10090 Rosta (TO)", telefono: "333 1234567", chi: "Ugo Perottino" }),
  ev("2", { cliente: "Bianchi Lucia", luogo: "Corso Francia 5, Rivoli (TO)", telefono: "011 9876543" }),
  ev("3", { titolo: "Posa · Città Giuseppe", cliente: "Città Giuseppe", luogo: "Piazza Castello, Torino" }),
];
const ids = (q: string) => cercaEventi(E, q).map((e) => e.id);

test("ricerca per nome, paese, via e in qualsiasi ordine, senza badare a maiuscole e accenti", () => {
  assert.deepEqual(ids("rossi"), ["1"]);
  assert.deepEqual(ids("mario rossi"), ["1"]);
  assert.deepEqual(ids("rivoli"), ["2"]);
  assert.deepEqual(ids("via roma"), ["1"]);
  assert.deepEqual(ids("citta"), ["3"]);
  assert.deepEqual(ids("TORINO"), ["3"]);
  assert.deepEqual(ids("ugo"), ["1"]);
  assert.deepEqual(ids("rossi rivoli"), []);
  assert.deepEqual(ids("   "), []);
});

test("ricerca per telefono: contano solo le cifre (almeno 5)", () => {
  assert.deepEqual(ids("3331234567"), ["1"]);
  assert.deepEqual(ids("333 123"), ["1"]);
  assert.deepEqual(ids("98765"), ["2"]);
  assert.deepEqual(ids("12"), ["1"]); // poche cifre: ricerca normale nel testo (via Roma 12)
});

test("colori: quello scelto vince, gli altri prendono i colori liberi della tavolozza", () => {
  const c = coloriPersone([{ id: "a", colore: PALETTE_PERSONE[0] }, { id: "b" }, { id: "c", colore: "#FF0000" }, { id: "d", colore: "rosso" }]);
  assert.equal(c.get("a")?.colore, PALETTE_PERSONE[0].toLowerCase());
  assert.equal(c.get("c")?.colore, "#ff0000");
  assert.notEqual(c.get("b")?.colore, PALETTE_PERSONE[0]); // il primo colore è già di «a»
  assert.equal(c.get("b")?.colore, PALETTE_PERSONE[1]);
  assert.equal(c.get("d")?.colore, PALETTE_PERSONE[2]); // colore non valido = automatico
  assert.ok(c.get("a")?.chiaro);
  // come prima, con i soli id
  assert.equal(coloriPersone(["x", "y"]).get("y")?.colore, PALETTE_PERSONE[1]);
});
