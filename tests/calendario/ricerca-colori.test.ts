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

test("cambiare il colore di una persona non sposta quelli automatici degli altri (Debora 24/11/2026)", async () => {
  const { coloriPersone, coloriDaFissare } = await import("../../src/lib/calendario/eventi");
  const prima = [{ id: "a", colore: null }, { id: "b", colore: null }, { id: "debora", colore: null }, { id: "c", colore: null }];
  const visti = coloriPersone(prima);
  const fissati = coloriDaFissare(prima, "debora");
  assert.deepEqual(fissati.map((f) => f.id), ["a", "b", "c"]);
  // dopo il salvataggio: gli altri col colore fissato, Debora con quello che sceglie (anche uno già usato da un collega)
  const dopo = prima.map((p) => p.id === "debora" ? { ...p, colore: visti.get("a")!.colore } : { ...p, colore: fissati.find((f) => f.id === p.id)!.colore });
  const nuovi = coloriPersone(dopo);
  for (const id of ["a", "b", "c"]) assert.equal(nuovi.get(id)!.colore.toLowerCase(), visti.get(id)!.colore.toLowerCase());
  assert.equal(nuovi.get("debora")!.colore.toLowerCase(), visti.get("a")!.colore.toLowerCase());
  // chi ha già un colore salvato non si riscrive
  assert.deepEqual(coloriDaFissare([{ id: "x", colore: "#123456" }, { id: "y", colore: null }], "y"), []);
});

test("tavolozza: i colori dei colleghi non si scelgono, il proprio sì anche se fuori tavolozza", async () => {
  const { coloriSceglibili, COLORI_CALENDARIO } = await import("../../src/lib/calendario/eventi");
  assert.equal(new Set(COLORI_CALENDARIO.map((c) => c.toLowerCase())).size, 30);
  const t = coloriSceglibili([{ nome: "Rocco", colore: "#2A78D6" }, { nome: "Cristina", colore: null }], "#123abc");
  assert.equal(t[0].colore, "#123abc");
  assert.ok(t[0].mio && !t[0].occupatoDa);
  assert.equal(t.find((c) => c.colore === "#2a78d6")?.occupatoDa, "Rocco");
  assert.equal(t.filter((c) => c.occupatoDa).length, 1);
  const mio = coloriSceglibili([{ nome: "Rocco", colore: "#eb6834" }], "#eb6834").find((c) => c.colore === "#eb6834");
  assert.ok(mio?.mio && !mio.occupatoDa);
});
