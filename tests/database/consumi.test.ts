import { test } from "node:test";
import assert from "node:assert/strict";
import { consumoDaNeon, stimaCosto, valutaAvviso, daAvvisare, tabellePiuLette, fineDelPeriodo } from "../../src/lib/database/consumi";

const GB = 1024 ** 3;
const progetto = (o: Record<string, unknown>) => ({ project: { consumption_period_start: "2026-11-01T00:00:00Z", consumption_period_end: "2026-12-01T00:00:00Z", ...o } });

test("consumoDaNeon legge i campi del progetto", () => {
  const c = consumoDaNeon(progetto({ compute_time_seconds: 36000, data_transfer_bytes: 5 * GB, synthetic_storage_size: GB / 2, active_time_seconds: 72000 }))!;
  assert.equal(c.cuSecondi, 36000);
  assert.equal(c.trasferimentoBytes, 5 * GB);
  assert.equal(fineDelPeriodo(c).toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(consumoDaNeon({}), null);
  assert.equal(consumoDaNeon({ project: { compute_time_seconds: 1 } }), null);
});

test("stimaCosto: costo fin qui e proiezione a fine mese allo stesso ritmo", () => {
  const c = consumoDaNeon(progetto({ compute_time_seconds: 100 * 3600, data_transfer_bytes: 10 * GB, synthetic_storage_size: 1 * GB }))!;
  const s = stimaCosto(c, new Date("2026-11-16T00:00:00Z")); // metà mese
  assert.equal(s.cuOre, 100);
  assert.equal(s.costo.calcolo, 10.6);
  assert.equal(s.proiezione.cuOre, 200);
  assert.equal(s.proiezione.trasferimentoGB, 20);
  assert.equal(s.costo.trasferimento, 0); // 500 GB compresi
  assert.equal(s.proiezione.totale, Math.round((200 * 0.106 + 0.35) * 100) / 100);
});

test("valutaAvviso: budget, traffico e piano gratuito", () => {
  const c = consumoDaNeon(progetto({ compute_time_seconds: 100 * 3600, data_transfer_bytes: 4.2 * GB, synthetic_storage_size: 0.1 * GB }))!;
  const s = stimaCosto(c, new Date("2026-11-16T00:00:00Z"));
  assert.equal(valutaAvviso(s, 50).livello, "ok");
  assert.equal(valutaAvviso(s, 25).livello, "attenzione");
  assert.equal(valutaAvviso(s, 15).livello, "superato");
  const free = valutaAvviso(s, 50, "FREE");
  assert.equal(free.livello, "superato"); // 100 ore = limite del gratuito
  assert.ok(free.motivi.some((m) => m.startsWith("traffico")));
});

test("daAvvisare: una volta al giorno, subito se peggiora", () => {
  const att = { livello: "attenzione" as const, motivi: ["x"] }, sup = { livello: "superato" as const, motivi: ["x"] };
  assert.equal(daAvvisare({ livello: "ok", motivi: [] }, null, "2026-11-15"), false);
  assert.equal(daAvvisare(att, null, "2026-11-15"), true);
  assert.equal(daAvvisare(att, { giorno: "2026-11-15", livello: "attenzione" }, "2026-11-15"), false);
  assert.equal(daAvvisare(sup, { giorno: "2026-11-15", livello: "attenzione" }, "2026-11-15"), true);
  assert.equal(daAvvisare(att, { giorno: "2026-11-14", livello: "superato" }, "2026-11-15"), true);
});

test("tabellePiuLette: righe lette × peso medio", () => {
  const t = tabellePiuLette([{ nome: "piccola", righe: 1000, bytes: 100_000, letture: 1_000_000 }, { nome: "foto", righe: 10, bytes: 50_000_000, letture: 1000 }]);
  assert.equal(t[0].nome, "foto");
  assert.equal(t[0].lettoStimato, 5_000_000_000);
});
