import { test } from "node:test";
import assert from "node:assert/strict";
import { SEZIONI_LEGNO, volumeBarra, riepilogoLegno, htmlRiepilogoLegno } from "../../src/lib/ordini/legno";
import { compilaScheda, descriviCampi, MODELLI_PRONTI } from "../../src/lib/ordini/scheda-produzione";

test("26 sezioni: 30×50…30×170 e 50×50…50×170", () => {
  assert.equal(SEZIONI_LEGNO.length, 26);
  assert.deepEqual(SEZIONI_LEGNO[0], { spessore: 30, larghezza: 50 });
  assert.deepEqual(SEZIONI_LEGNO[12], { spessore: 30, larghezza: 170 });
  assert.deepEqual(SEZIONI_LEGNO[13], { spessore: 50, larghezza: 50 });
  assert.deepEqual(SEZIONI_LEGNO[25], { spessore: 50, larghezza: 170 });
});

test("cubatura e prezzo sullo sviluppo", () => {
  assert.equal(volumeBarra({ spessore: 30, larghezza: 50 }), 0.0045);
  const r = riepilogoLegno({ tab_legno_1_pezzi: "10", tab_legno_26_pezzi: "4", tab_legno_26_lunghezza: "2500" }, 900);
  assert.equal(r.righe.length, 2);
  assert.equal(r.righe[0].prezzoBarra, 4.05); // 30×50×3000 = 0,0045 m³ × 900
  assert.equal(r.righe[1].prezzoBarra, 19.13); // 50×170×2500 = 0,02125 m³ × 900 = 19,125
  assert.equal(r.pezzi, 14);
  assert.equal(r.totale, 40.5 + 76.52);
  assert.equal(Math.round(r.m3 * 10000) / 10000, 0.13);
});

test("la scheda: riepilogo senza prezzi se non è scritto il prezzo concordato", () => {
  assert.ok(!htmlRiepilogoLegno({ tab_legno_3_pezzi: "2" }).includes("€"));
  assert.ok(htmlRiepilogoLegno({ tab_legno_3_pezzi: "2", prezzo_m3: "850" }).includes("850,00 €/m³"));
  const m = MODELLI_PRONTI.find((x) => x.chiave === "legno")!;
  const campi = descriviCampi(m.html).map((d) => d.nome);
  assert.ok(campi.includes("tab_legno_26_pezzi") && campi.includes("prezzo_m3") && !campi.includes("riepilogo_legno"));
  const html = compilaScheda(m.html, { tab_legno_14_pezzi: "6", essenza: "Abete" }, "");
  assert.ok(html.includes("50 × 50 × 3000") && html.includes("&#9746; Abete"));
});

import { codiceLegno, leggiCodiceLegno, valoriDaRighe, righeDaValori } from "../../src/lib/ordini/legno";

test("codici degli articoli e andata/ritorno con le righe dell'ordine", () => {
  assert.equal(codiceLegno({ spessore: 30, larghezza: 50 }), "LEGNO-30X50-3000");
  assert.deepEqual(leggiCodiceLegno("LEGNO-50X170-2500"), { riga: 26, lunghezza: 2500 });
  assert.equal(leggiCodiceLegno("LEGNO-40X50-3000"), null);
  assert.equal(leggiCodiceLegno("ALTRO"), null);
  const righe = righeDaValori({ tab_legno_1_pezzi: "10", tab_legno_26_pezzi: "4", tab_legno_26_lunghezza: "2500" }, 900);
  assert.deepEqual(righe.map((r) => [r.codice, r.quantita, r.prezzo]), [["LEGNO-30X50-3000", 10, 4.05], ["LEGNO-50X170-2500", 4, 19.13]]);
  const v = valoriDaRighe(righe.map((r) => ({ codice: r.codice, quantita: r.quantita, prezzoAcquisto: r.prezzo })).concat([{ codice: "XYZ", quantita: 3, prezzoAcquisto: 1 }]));
  assert.equal(v.tab_legno_1_pezzi, "10");
  assert.equal(v.tab_legno_26_lunghezza, "2500");
  assert.equal(v.prezzo_m3, "900");
});

import { leggiLegnoLibero, costoLegno, venditaLegno } from "../../src/lib/ordini/legno";

test("legno su misura: misure libere nel modulo, codice, prezzi", () => {
  const l = leggiLegnoLibero("LEGNO-35X75-2400")!;
  assert.deepEqual(l, { sezione: { spessore: 35, larghezza: 75 }, lunghezza: 2400 });
  assert.equal(costoLegno(l.sezione, l.lunghezza), 5.67); // 0,0063 m³ × 900
  assert.equal(venditaLegno(l.sezione, l.lunghezza), 11.34);
  const v = { tab_legno_1_pezzi: "2", tab_legnol_1_spessore: "35", tab_legnol_1_larghezza: "75", tab_legnol_1_lunghezza: "2400", tab_legnol_1_pezzi: "4" };
  const righe = righeDaValori(v, 900);
  assert.deepEqual(righe.map((r) => [r.codice, r.quantita, r.prezzo]), [["LEGNO-30X50-3000", 2, 4.05], ["LEGNO-35X75-2400", 4, 5.67]]);
  const back = valoriDaRighe(righe.map((r) => ({ codice: r.codice, quantita: r.quantita, prezzoAcquisto: r.prezzo })));
  assert.equal(back.tab_legnol_1_larghezza, "75");
  assert.equal(back.tab_legnol_1_pezzi, "4");
  assert.equal(back.tab_legno_1_pezzi, "2");
  assert.ok(htmlRiepilogoLegno(v).includes("35 × 75 × 2400"));
});
