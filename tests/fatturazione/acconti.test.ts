import { test } from "node:test";
import assert from "node:assert/strict";
import { accontiDaDedurre, aliquotaDa, chiaveNumero, descrizioneDeduzione, nonAgganciatiAttribuibili, numeriGiaDedotti, rigaDeduzione, type AccontoEmesso } from "../../src/lib/fatturazione/acconti";

const crm: AccontoEmesso = { numero: "541/FE/2026", data: new Date("2026-11-02T12:00:00Z"), imponibile: 1000, aliquota: 10, fonte: "CRM" };
const bc: AccontoEmesso = { numero: "541/fe/2026 ", data: new Date("2026-11-02T12:00:00Z"), imponibile: 1000, aliquota: 10, fonte: "BCONSOLE" };
const bc2: AccontoEmesso = { numero: "300/FE/2026", data: new Date("2026-10-01T12:00:00Z"), imponibile: 2000, aliquota: 22, fonte: "BCONSOLE" };

test("lo stesso numero in CRM e BConsole si deduce una volta sola (vince il CRM)", () => {
  const r = accontiDaDedurre([bc, crm]);
  assert.equal(r.length, 1);
  assert.equal(r[0].fonte, "CRM");
});

test("ordinati per data e senza quelli già presenti come riga", () => {
  assert.deepEqual(accontiDaDedurre([crm, bc2]).map((a) => a.numero), ["300/FE/2026", "541/FE/2026"]);
  const gia = [descrizioneDeduzione(bc2)];
  assert.deepEqual(accontiDaDedurre([crm, bc2], gia).map((a) => a.numero), ["541/FE/2026"]);
  assert.ok(numeriGiaDedotti(gia).has(chiaveNumero("300/FE/2026")));
});

test("riga di deduzione con segno meno e aliquota dell'acconto", () => {
  const r = rigaDeduzione(bc2);
  assert.equal(r.prezzo, -2000);
  assert.equal(r.aliquota, 22);
  assert.equal(r.descrizione, "A dedurre acconto fattura n. 300/FE/2026 del 01/10/2026");
});

test("aliquota ricavata da imponibile e IVA", () => {
  assert.equal(aliquotaDa(1000, 100, 22), 10);
  assert.equal(aliquotaDa(1000, 220, 10), 22);
  assert.equal(aliquotaDa(1000, 137, 10), 10);
  assert.equal(aliquotaDa(0, 0, 22), 22);
});

test("acconti non agganciati: solo con una sola commessa aperta e proprio quella", () => {
  assert.equal(nonAgganciatiAttribuibili(["c1"], "c1"), true);
  assert.equal(nonAgganciatiAttribuibili(["c1", "c2"], "c1"), false);
  assert.equal(nonAgganciatiAttribuibili([], "c1"), false);
  assert.equal(nonAgganciatiAttribuibili(["c2"], "c1"), false);
});
