import { test } from "node:test";
import assert from "node:assert/strict";
import { eSuMisura, periodoSuMisura, nomePeriodo, estremi, vendutoNelPeriodo, suMisuraInCorso, avanzamento, emailSettimanale } from "../../src/lib/provvigioni/obiettivi";

const p = periodoSuMisura("2026-11-16", "2026-12-31");

test("periodo su misura: riconosciuto, nome e estremi", () => {
  assert.equal(p, "2026-11-16~2026-12-31");
  assert.ok(eSuMisura(p) && !eSuMisura("2026-11") && !eSuMisura("2026"));
  assert.equal(nomePeriodo(p), "dal 16/11/2026 al 31/12/2026");
  assert.deepEqual(estremi(p), { da: "2026-11-16", a: "2026-12-31" });
  assert.ok(suMisuraInCorso(p, "2026-11-16") && suMisuraInCorso(p, "2026-12-31") && !suMisuraInCorso(p, "2026-11-15") && !suMisuraInCorso("2026-11", "2026-11-16"));
});

test("venduto solo dentro le date (ora di Roma)", () => {
  const c = (iso: string, imponibile: number) => ({ data: new Date(iso), imponibile });
  const lista = [c("2026-11-15T23:30:00Z", 1000) /* a Roma è già il 16 */, c("2026-11-15T10:00:00Z", 500), c("2026-12-31T23:30:00Z", 700) /* a Roma è il 1° gennaio */, c("2026-12-10T10:00:00Z", 2000)];
  assert.equal(vendutoNelPeriodo(lista, p), 3000);
  // mese e anno funzionano come prima
  assert.equal(vendutoNelPeriodo(lista, "2026-11"), 1500);
  assert.equal(vendutoNelPeriodo(lista, "2026"), 3500);
});

test("tabella di marcia e email con l'obiettivo su misura", () => {
  const av = avanzamento(46000, 10000, p, "2026-11-30"); // 15 giorni su 46
  assert.equal(av.giorniTotali, 46);
  assert.equal(av.atteso, 15000);
  assert.equal(av.stato, "INDIETRO");
  const m = emailSettimanale({ nome: "Marco Piccatti", oggi: "2026-11-30", altri: [{ periodo: p, titolo: "Pergole di Natale", av, premio: 500 }], link: "x" });
  assert.ok(m && m.testo.includes("🎯 Pergole di Natale (dal 16/11/2026 al 31/12/2026)") && m.testo.includes("premio") && m.oggetto.includes("dal 16/11/2026"));
});
