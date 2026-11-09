import { test } from "node:test";
import assert from "node:assert/strict";
import { doppioniImportati, leadDaAvanzare, type AppRiordino, type ClienteRiordino, type LeadRiordino } from "../../src/lib/calendario/riordino";

const d = (s: string) => new Date(s);
const app = (id: string, clienteId: string, dataOra: string, extra: Partial<AppRiordino> = {}): AppRiordino =>
  ({ id, chiaveImport: null, clienteId, utenteId: "u1", dataOra: d(dataOra), stato: "PROGRAMMATO", luogo: null, titolo: null, createdAt: d("2026-11-09T10:00:00Z"), ...extra });
const clienti: ClienteRiordino[] = [
  { id: "c1", nome: "Rossi Mario", telefono: "+39 333 1234567", cellulare: null, email: null },
  { id: "c2", nome: "MARIO ROSSI", telefono: null, cellulare: "3331234567", email: null }, // creato dall'import: stessa persona
  { id: "c3", nome: "Bianchi Anna", telefono: "011 999888", cellulare: null, email: "anna@x.it" },
];

test("doppioni: stesso giorno e stessa persona (anche cliente diverso con lo stesso telefono)", () => {
  const a = [
    app("n1", "c1", "2026-10-12T08:00:00Z"),
    app("b1", "c2", "2026-10-12T09:30:00Z", { chiaveImport: "BC|1" }), // doppio di n1 (telefono uguale)
    app("b2", "c2", "2026-10-13T09:30:00Z", { chiaveImport: "BC|2" }), // altro giorno: resta
    app("b3", "c3", "2026-10-12T09:30:00Z", { chiaveImport: "BC|3" }), // altra persona: resta
  ];
  assert.deepEqual(doppioniImportati(a, clienti), [{ id: "b1", tieni: "n1" }]);
});

test("doppioni: si tiene quello importato se in P&C ONE è annullato", () => {
  const a = [app("n1", "c1", "2026-10-12T08:00:00Z", { stato: "ANNULLATO" }), app("b1", "c1", "2026-10-12T15:00:00Z", { chiaveImport: "BC|1" })];
  assert.deepEqual(doppioniImportati(a, clienti), []);
  a[1].stato = "ANNULLATO";
  assert.deepEqual(doppioniImportati(a, clienti), [{ id: "b1", tieni: "n1" }]);
});

test("lead appesi: visita dopo l'arrivo del lead; un ricontatto concordato dopo la visita resta", () => {
  const a = [app("b1", "c1", "2026-11-20T09:00:00Z", { chiaveImport: "BC|1", utenteId: "venditore" }), app("b3", "c3", "2026-10-01T09:00:00Z", { luogo: "Showroom Rosta" })];
  const leads: LeadRiordino[] = [
    { id: "l1", nome: "Mario Rossi", telefono: "3331234567", email: null, fase: "NON_RISPONDE", createdAt: d("2026-10-20T00:00:00Z"), clienteId: null, ultimoEsitoIl: d("2026-11-25T00:00:00Z") }, // classificato in blocco dopo la visita: avanza lo stesso
    { id: "l2", nome: "Anna Bianchi", telefono: null, email: "ANNA@x.it", fase: "DA_RICHIAMARE", createdAt: d("2026-09-01T00:00:00Z"), clienteId: null, ultimoEsitoIl: d("2026-10-05T00:00:00Z") }, // richiamo dopo l'appuntamento: resta
    { id: "l3", nome: "Anna Bianchi", telefono: null, email: "anna@x.it", fase: "NUOVO", createdAt: d("2026-09-20T00:00:00Z"), clienteId: null, ultimoEsitoIl: null },
    { id: "l4", nome: "Mario Rossi", telefono: null, email: null, fase: "NON_INTERESSATO", createdAt: d("2026-10-20T00:00:00Z"), clienteId: null, ultimoEsitoIl: null }, // chiuso: non si tocca
  ];
  const r = leadDaAvanzare(leads, a, clienti);
  assert.deepEqual(r.map((x) => [x.leadId, x.appuntamentoId, x.esito, x.utenteId]), [["l1", "b1", "APPUNTAMENTO_CASA", "venditore"], ["l3", "b3", "APPUNTAMENTO_SHOWROOM", "u1"]]);
  assert.deepEqual(leadDaAvanzare(leads, a, clienti, new Set(["b1"])).map((x) => x.leadId), ["l3"]);
  // i ricontatti del centralino (appuntamenti della telefonista) non contano
  assert.deepEqual(leadDaAvanzare(leads, a, clienti, new Set(), new Set(["venditore"])).map((x) => x.leadId), ["l3"]);
  // la telefonata fissata per il commerciale diventa «chiamata con commerciale»
  a[1].tipo = "TELEFONICO";
  assert.deepEqual(leadDaAvanzare(leads, a, clienti).map((x) => [x.leadId, x.esito]), [["l1", "APPUNTAMENTO_CASA"], ["l3", "APPUNTAMENTO_TELEFONICO"]]);
});

test("lead appesi: visita precedente all'arrivo del lead non conta", () => {
  const a = [app("b1", "c1", "2026-09-18T09:00:00Z", { chiaveImport: "BC|1" })];
  const l: LeadRiordino = { id: "l1", nome: "Mario Rossi", telefono: "3331234567", email: null, fase: "IN_TARGET", createdAt: d("2026-10-05T00:00:00Z"), clienteId: null, ultimoEsitoIl: null };
  assert.deepEqual(leadDaAvanzare([l], a, clienti), []);
});
