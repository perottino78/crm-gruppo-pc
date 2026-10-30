import { test } from "node:test";
import assert from "node:assert/strict";
import { daOraRoma, perInput, chiaveGiorno, lunediDi, grigliaMese, aggiungiGiorni, giornoSettimana } from "../../src/lib/calendario/tempo";
import { impagina, giorniEvento, type EventoCal } from "../../src/lib/calendario/eventi";
import { calendarioIcs, piega, escapeIcs } from "../../src/lib/calendario/ics";

test("ora di Roma ↔ istante, con ora solare e legale", () => {
  assert.equal(daOraRoma("2026-11-03T09:00")!.toISOString(), "2026-11-03T08:00:00.000Z"); // solare UTC+1
  assert.equal(daOraRoma("2026-07-03T09:00")!.toISOString(), "2026-07-03T07:00:00.000Z"); // legale UTC+2
  assert.equal(perInput(new Date("2026-11-03T08:00:00Z")), "2026-11-03T09:00");
  assert.equal(chiaveGiorno(new Date("2026-11-02T23:30:00Z")), "2026-11-03"); // 00:30 a Roma
  assert.equal(daOraRoma("xx"), null);
});

test("settimane e mesi", () => {
  assert.equal(giornoSettimana("2026-11-01"), 7); // domenica
  assert.equal(lunediDi("2026-11-01"), "2026-10-26");
  assert.equal(aggiungiGiorni("2026-12-31", 1), "2027-01-01");
  const g = grigliaMese("2026-11-15");
  assert.equal(g.length, 42);
  assert.equal(g[0], "2026-10-26");
});

const ev = (id: string, da: string, a: string, extra: Partial<EventoCal> = {}): EventoCal => ({
  id, tipo: "APPUNTAMENTO", inizio: daOraRoma(da)!, fine: daOraRoma(a)!, giornataIntera: false, titolo: id, stato: "PROGRAMMATO", href: "/", ...extra,
});

test("appuntamenti sovrapposti vanno affiancati", () => {
  const p = impagina([ev("a", "2026-11-03T09:00", "2026-11-03T10:00"), ev("b", "2026-11-03T09:30", "2026-11-03T10:30"), ev("c", "2026-11-03T11:00", "2026-11-03T12:00")], 7, 21);
  const a = p.find((x) => x.e.id === "a")!, b = p.find((x) => x.e.id === "b")!, c = p.find((x) => x.e.id === "c")!;
  assert.equal(a.top, 120);
  assert.equal(a.altezza, 60);
  assert.equal(a.colonne, 2);
  assert.notEqual(a.colonna, b.colonna);
  assert.equal(c.colonne, 1);
});

test("una posa di 3 giorni occupa 3 caselle", () => {
  const e = ev("posa", "2026-11-03T00:00", "2026-11-06T00:00", { giornataIntera: true, tipo: "POSA" });
  assert.deepEqual(giorniEvento(e), ["2026-11-03", "2026-11-04", "2026-11-05"]);
});

test("invito .ics valido", () => {
  const t = calendarioIcs([{ uid: "x@crm", inizio: daOraRoma("2026-11-03T09:00")!, fine: daOraRoma("2026-11-03T10:00")!, titolo: "Visita, Rossi; misure", luogo: "Via Roma 1, Rosta", partecipanti: [{ nome: "Ugo", email: "ugo@gruppopec.com" }], promemoriaMin: 60 }], { metodo: "REQUEST" });
  assert.match(t, /METHOD:REQUEST/);
  assert.match(t, /DTSTART:20261103T080000Z/);
  assert.match(t, /SUMMARY:Visita\\, Rossi\\; misure/);
  assert.match(t, /TRIGGER:-PT60M/);
  assert.ok(t.split("\r\n").every((r) => Buffer.byteLength(r) <= 75));
  const c = calendarioIcs([{ uid: "x@crm", inizio: new Date(), fine: new Date(), titolo: "a" }], { metodo: "CANCEL" });
  assert.match(c, /STATUS:CANCELLED/);
  assert.equal(escapeIcs("a\nb"), "a\\nb");
  assert.ok(piega("x".repeat(200)).includes("\r\n "));
});
