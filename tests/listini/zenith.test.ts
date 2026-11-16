import { test } from "node:test";
import assert from "node:assert/strict";
import { listiniZenith, optionalZenith, partiZenith } from "../../src/lib/listini/zenith";
import { optionalOptima } from "../../src/lib/listini/optima";
import { optionalFidra } from "../../src/lib/listini/fidra";
import { optionalPlasma30 } from "../../src/lib/listini/plasma30";
import { tendinaDi, sceltePerRilievo, vetriSpeciali } from "../../src/lib/listini/serramenti-comuni";

const chiave = (o: { categoria: string; nome: string; listino: string }) => `${o.categoria}|${o.nome}|${o.listino}`;

test("Zenith: listini per tipologia (finestre/portefinestre, doppio/triplo, wasistas, PF3A)", () => {
  assert.deepEqual(partiZenith("ZENITH_PF3A_SOGLIA_UKW10"), { modello: "PF3A_SOGLIA", triplo: true });
  assert.deepEqual(listiniZenith("ZENITH_F1A_UKW13"), ["ZENITH", "ZENITH_F", "ZENITH_DOPPIO"]);
  assert.deepEqual(listiniZenith("ZENITH_WASISTAS_UKW10"), ["ZENITH", "ZENITH_F", "ZENITH_TRIPLO", "ZENITH_WAS"]);
  assert.deepEqual(listiniZenith("ZENITH_PF3A_SOGLIA_UKW13"), ["ZENITH", "ZENITH_PF", "ZENITH_DOPPIO", "ZENITH_PF3A"]);
  assert.deepEqual(listiniZenith("OPTIMA_F1A"), []);
});

test("Zenith: colore esterno e interno con i costi, vetri, accessori, forme trapezoidali e curve", () => {
  const o = optionalZenith();
  assert.equal(new Set(o.map(chiave)).size, o.length, "niente voci doppie");
  const est = o.filter((x) => x.categoria === "Colore esterno");
  const int = o.filter((x) => x.categoria === "Colore interno");
  assert.equal(est.find((x) => x.nome === "Bianco massa")?.valore, 0);
  assert.ok(est.filter((x) => x.nome.endsWith("— pellicola")).every((x) => x.tipoPrezzo === "PERCENTUALE" && x.valore === 20), "pellicole +20%");
  assert.equal(int.find((x) => x.nome === "Uguale all'esterno")?.valore, 0);
  assert.ok(int.some((x) => x.nome.includes("diversa da quella esterna") && x.valore === 80), "diversa: +100% in tutto con il +20% esterno");
  assert.ok(o.some((x) => x.nome.startsWith("Vetro antisfondamento 4+4") && x.listino === "ZENITH_PF" && x.unita === "anta"));
  assert.ok(o.some((x) => x.nome.startsWith("Vetro insonorizzante") && x.listino === "ZENITH_F"));
  assert.ok(o.some((x) => x.nome === "Forma trapezoidale (fuori squadro)" && x.valore === 40 && x.tipoPrezzo === "PERCENTUALE"));
  assert.ok(o.some((x) => x.nome.startsWith("Forma curva") && x.valore === 40));
  assert.ok(!o.some((x) => /ENEA|Autoscala/.test(x.nome)), "ENEA e autoscala stanno in «Servizi e pratiche»");
  assert.ok(o.filter((x) => x.categoria === "Accessori").length >= 6, "accessori tutti nella stessa tendina");
});

test("Optima, Fidra e Plasma 30: vetri speciali e forma trapezoidale senza doppioni", () => {
  for (const [nome, voci] of [["optima", optionalOptima()], ["fidra", optionalFidra()], ["plasma30", optionalPlasma30()]] as const) {
    assert.equal(new Set(voci.map(chiave)).size, voci.length, `${nome}: niente voci doppie`);
    assert.ok(voci.some((x) => x.nome === "Forma trapezoidale (fuori squadro)"), `${nome}: trapezoidale`);
    assert.ok(voci.some((x) => x.nome.startsWith("Vetro antisfondamento")), `${nome}: antisfondamento`);
  }
  assert.equal(vetriSpeciali("X").length, 10);
});

test("tendine: accessori insieme, lavorazioni e misure; scelte per il rilievo", () => {
  assert.equal(tendinaDi("Maniglie e ferramenta"), "Accessori");
  assert.equal(tendinaDi("Traversi e pannelli"), "Accessori");
  assert.equal(tendinaDi("Misure e lavorazioni"), "Lavorazioni e misure");
  assert.equal(tendinaDi("Vetri"), "Vetri");
  assert.equal(
    sceltePerRilievo([
      { quantita: 1, optional: { categoria: "Colore esterno", nome: "Rovere gold (AP 23) — pellicola" } },
      { quantita: 2, nota: "bagno", optional: { categoria: "Vetri", nome: "Vetro satinato (ad anta)" } },
    ]),
    "Colore esterno: Rovere gold (AP 23) — pellicola · Vetri: Vetro satinato (ad anta) ×2 (bagno)",
  );
});
