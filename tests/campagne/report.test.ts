import { test } from "node:test";
import assert from "node:assert/strict";
import { rapportoPerPeriodo, contaInvii, chiaveSettimana } from "../../src/lib/campagne/report";

const inv = (stato: string, ap = false, cl = false) => ({ stato, apertaIl: ap ? new Date() : null, clicIl: cl ? new Date() : null });

test("conteggi: il clic conta anche come apertura, i rimbalzi non sono consegnati", () => {
  const r = contaInvii([inv("INVIATA", true), inv("INVIATA", false, true), inv("INVIATA"), inv("INVIATA"), inv("RIMBALZATA"), inv("SOPPRESSA")]);
  assert.equal(r.consegnate, 4); assert.equal(r.aperte, 2); assert.equal(r.clic, 1); assert.equal(r.apertePerc, 50); assert.equal(r.rimbalzate, 1); assert.equal(r.disiscritti, 1);
});
test("settimana: lunedì di Roma", () => {
  assert.equal(chiaveSettimana(new Date("2026-11-17T10:00:00Z")), "2026-11-16");
  assert.equal(chiaveSettimana(new Date("2026-11-22T23:30:00Z")), "2026-11-23");
});
test("report per mese e per settimana, dal più recente, senza le mai inviate", () => {
  const c = (id: string, d: string | null, invii = [inv("INVIATA", true)]) => ({ id, nome: id, inviataIl: d ? new Date(d) : null, createdAt: new Date(), invii });
  const l = [c("a", "2026-11-03T10:00:00Z"), c("b", "2026-11-17T10:00:00Z"), c("c", "2026-10-20T10:00:00Z"), c("d", null)];
  const m = rapportoPerPeriodo(l, "mese");
  assert.deepEqual(m.map((r) => [r.chiave, r.campagne]), [["2026-11", 2], ["2026-10", 1]]);
  assert.equal(rapportoPerPeriodo(l, "settimana").length, 3);
});
