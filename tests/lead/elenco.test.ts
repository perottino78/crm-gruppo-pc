import { test } from "node:test";
import assert from "node:assert/strict";
import { vistaDa, vistaDiScadenza, conteggiPerGiorno, grigliaMese, meseVicino, perGiornoDecrescente, dataTask } from "../../src/lib/lead/elenco";

test("viste dei lead: oggi, scaduti, in programma", () => {
  const ini = new Date("2026-11-11T00:00:00+01:00"), fine = new Date("2026-11-12T00:00:00+01:00");
  assert.equal(vistaDiScadenza(null, ini, fine), "oggi");
  assert.equal(vistaDiScadenza(new Date("2026-11-11T08:00:00+01:00"), ini, fine), "oggi");
  assert.equal(vistaDiScadenza(new Date("2026-11-10T18:30:00+01:00"), ini, fine), "scaduti");
  assert.equal(vistaDiScadenza(new Date("2026-11-12T09:00:00+01:00"), ini, fine), "programma");
  assert.equal(vistaDa("dafare"), "oggi");
  assert.equal(vistaDa("scaduti"), "scaduti");
  assert.equal(vistaDa("boh"), "oggi");
});

test("calendario: griglia da lunedì, conteggi, mesi vicini", () => {
  const g = grigliaMese("2026-11"); // 1/11/2026 è domenica
  assert.deepEqual(g[0], [null, null, null, null, null, null, "2026-11-01"]);
  assert.equal(g.flat().filter(Boolean).length, 30);
  assert.equal(g.at(-1)!.at(-1), null);
  assert.deepEqual(conteggiPerGiorno(["2026-11-11", "2026-11-11", "2026-11-12"]), { "2026-11-11": 2, "2026-11-12": 1 });
  assert.equal(meseVicino("2026-11", 2), "2027-01");
  assert.equal(meseVicino("2026-01", -1), "2025-12");
});

test("«Tutti» come un estratto conto: per giorno, dal più recente", () => {
  const r = [{ k: "2026-11-09", n: 1 }, { k: "2026-11-11", n: 2 }, { k: "2026-11-09", n: 3 }];
  assert.deepEqual(perGiornoDecrescente(r, (x) => x.k).map((x) => [x.giorno, x.righe.map((y) => y.n)]), [["2026-11-11", [2]], ["2026-11-09", [1, 3]]]);
  const c = new Date("2026-11-01T10:00:00Z"), s = new Date("2026-11-20T10:00:00Z");
  assert.equal(dataTask({ scadenzaAzione: s, createdAt: c }), s);
  assert.equal(dataTask({ scadenzaAzione: null, createdAt: c }), c);
});
