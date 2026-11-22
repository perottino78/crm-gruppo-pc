import { test } from "node:test";
import assert from "node:assert/strict";
import { scegliTaskDoppi } from "../../src/lib/pratica/task-doppi";

const CHIUSI = ["FATTO", "ANNULLATO"];
const t = (id: string, fase: string | null, stato: string, min: number, costo = 0, chiuso = false) =>
  ({ id, faseChiave: fase, stato, completatoIl: chiuso ? new Date() : null, createdAt: new Date(2026, 10, 22, 17, min), costoLavoro: costo });

test("due task aperti della stessa fase: resta quello con il costo", () => {
  const r = scegliTaskDoppi([t("a", "ORDINI", "IN_CORSO", 52, 60), t("b", "ORDINI", "DA_INIZIARE", 53)], CHIUSI);
  assert.deepEqual(r.tieni.map((x) => x.id), ["a"]);
  assert.deepEqual(r.doppi.map((x) => x.id), ["b"]);
});

test("senza costo resta il più vecchio aperto; i task senza fase non si toccano", () => {
  const r = scegliTaskDoppi([t("a", "ORDINI", "DA_INIZIARE", 52), t("b", "ORDINI", "DA_INIZIARE", 53), t("x", null, "DA_INIZIARE", 54), t("y", null, "DA_INIZIARE", 55)], CHIUSI);
  assert.deepEqual(r.tieni.map((x) => x.id).sort(), ["a", "x", "y"]);
});

test("un task chiuso e uno aperto: si tiene l'aperto", () => {
  const r = scegliTaskDoppi([t("a", "RILIEVO", "FATTO", 10, 0, true), t("b", "RILIEVO", "DA_INIZIARE", 20)], CHIUSI);
  assert.deepEqual(r.tieni.map((x) => x.id), ["b"]);
});
