import { test } from "node:test";
import assert from "node:assert/strict";
import { angolareDellaRiga, codiceAngolare, costoBarra, kgBarra, leggiCodiceAngolare, righeDaAngolari, valoriAngolari, venditaBarra, htmlRiepilogoAngolari, sviluppo, descrizioneAngolare } from "../../src/lib/ordini/angolari";
import { descriviCampi, MODELLI_PRONTI, compilaScheda } from "../../src/lib/ordini/scheda-produzione";

test("costo a peso di Il Mastro e vendita ×2", () => {
  const x = angolareDellaRiga({ tab_ang_1_forma: "L", tab_ang_1_a: "30", tab_ang_1_b: "50", tab_ang_1_spessore: "1.5", tab_ang_1_colore: "0", tab_ang_1_pezzi: "4" }, 1)!;
  // misure esterne: sviluppo 30 + 50 − 1,5 (una piega) = 78,5 mm × 1,5 mm × 3000 mm × 2,7 = 0,954 kg × 14 €/kg = 13,35
  assert.equal(Math.round(kgBarra(x) * 1000) / 1000, 0.954);
  assert.equal(costoBarra(x), 13.35);
  assert.equal(venditaBarra(x), 26.7);
  // RAL (16 €/kg) e profilo a U con tre lati
  const u = angolareDellaRiga({ tab_ang_2_forma: "U", tab_ang_2_a: "20", tab_ang_2_b: "50", tab_ang_2_c: "20", tab_ang_2_spessore: "1", tab_ang_2_colore: "6", tab_ang_2_lunghezza: "2000", tab_ang_2_pezzi: "1" }, 2)!;
  assert.equal(costoBarra(u), Math.max(0.5, Math.round((88 * 1 * 2000 * 2.7 / 1e6) * 16 * 20) / 20)); // 90 − 2 pieghe × 1 mm
  // senza i lati necessari la riga non vale
  assert.equal(angolareDellaRiga({ tab_ang_3_forma: "U", tab_ang_3_a: "20", tab_ang_3_b: "50", tab_ang_3_pezzi: "2" }, 3), null);
});

test("codice della riga d'ordine: andata e ritorno", () => {
  const x = { forma: "Z" as const, a: 20, b: 40, c: 20, spessore: 2, bello: "ENTRAMBI", colore: 6, lunghezza: 2500, pezzi: 3, misura: "EST" };
  assert.equal(codiceAngolare(x), "ANGALL-Z-20X40X20-20-ENTRAMBI-C6-2500-ME");
  assert.deepEqual(leggiCodiceAngolare(codiceAngolare(x), 3), x);
  assert.equal(leggiCodiceAngolare("LEGNO-30X50-3000"), null);
});

test("modulo già compilato: righe salvate, altrimenti proposta dai legni (anche del rilevatore)", () => {
  const prop = valoriAngolari([{ codice: "LEGNO-30X50-3000", quantita: 10 }], [{ codice: "LEGNO-50X170-2500", quantita: 4 }]);
  assert.equal(prop.proposta, true);
  assert.equal(prop.valori.tab_ang_1_a, "30");
  assert.equal(prop.valori.tab_ang_1_b, "50");
  assert.equal(prop.valori.tab_ang_2_lunghezza, "2500");
  assert.equal(prop.valori.tab_ang_2_pezzi, "4");
  const righe = righeDaAngolari(prop.valori);
  assert.equal(righe.length, 2);
  const salv = valoriAngolari(righe.map((r) => ({ codice: r.codice, quantita: r.quantita })), [{ codice: "LEGNO-30X60-3000", quantita: 1 }]);
  assert.equal(salv.proposta, false);
  assert.equal(salv.valori.tab_ang_3_pezzi, undefined);
});

test("scheda per il fornitore: legenda, lati e kg senza prezzi", () => {
  const m = MODELLI_PRONTI.find((x) => x.chiave === "angolari")!;
  const campi = descriviCampi(m.html).map((d) => d.nome);
  assert.ok(campi.includes("tab_ang_12_pezzi") && !campi.includes("riepilogo_angolari"));
  const v = { tab_ang_1_forma: "L", tab_ang_1_a: "30", tab_ang_1_b: "50", tab_ang_1_bello: "INT", tab_ang_1_pezzi: "2" };
  const h = htmlRiepilogoAngolari(v);
  assert.ok(h.includes("Angolare a L") && h.includes("30×50") && h.includes("Interno") && !h.includes("€"));
  assert.ok(compilaScheda(m.html, v, "").includes("<svg"));
});

test("copertina a punta, misure interne/esterne e codici vecchi", () => {
  const base = { tab_ang_1_forma: "PUNTA", tab_ang_1_a: "40", tab_ang_1_b: "40", tab_ang_1_angolo: "120", tab_ang_1_spessore: "1", tab_ang_1_pezzi: "2" };
  const p = angolareDellaRiga(base, 1)!;
  assert.equal(p.angolo, 120);
  assert.equal(sviluppo(p), 79); // 40+40 − 1 piega × 1 mm (misure esterne)
  const conRisvolti = angolareDellaRiga({ ...base, tab_ang_1_c: "15", tab_ang_1_misura: "INT" }, 1)!;
  assert.equal(sviluppo(conRisvolti), 40 + 40 + 2 * 15 + 3); // risvolto sui due lati, 3 pieghe, misure interne
  assert.ok(descrizioneAngolare(conRisvolti).includes("Copertina a punta") && descrizioneAngolare(conRisvolti).includes("a 120°") && descrizioneAngolare(conRisvolti).includes("misure interne"));
  assert.deepEqual(leggiCodiceAngolare(codiceAngolare(conRisvolti), 2), conRisvolti);
  // codici salvati prima: misure esterne
  assert.equal(leggiCodiceAngolare("ANGALL-L-30X50X0-15-EST-C0-3000")?.misura, "EST");
  // a L con misure interne: 30+50 + 1,5
  const li = angolareDellaRiga({ tab_ang_1_forma: "L", tab_ang_1_a: "30", tab_ang_1_b: "50", tab_ang_1_misura: "INT", tab_ang_1_pezzi: "1" }, 1)!;
  assert.equal(sviluppo(li), 81.5);
});
