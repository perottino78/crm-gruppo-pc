import { test } from "node:test";
import assert from "node:assert/strict";
import { listiniZenith, optionalZenith, partiZenith } from "../../src/lib/listini/zenith";
import { optionalOptima } from "../../src/lib/listini/optima";
import { optionalFidra } from "../../src/lib/listini/fidra";
import { optionalPlasma30 } from "../../src/lib/listini/plasma30";
import { tendinaDi, sceltePerRilievo, vetriSpeciali } from "../../src/lib/listini/serramenti-comuni";
import { schedaCliente } from "../../src/lib/preventivi/scheda-cliente";

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
  assert.ok(int.some((x) => x.nome.includes("diversa da quella esterna") && x.valore === 0), "diversa: nessun +80%, il +20% totale è già nell'esterno");
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
  assert.equal(vetriSpeciali("X").length, 7);
  assert.equal(vetriSpeciali("X", { stratificatoDiSerie: true }).length, 6);
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

test("Zenith 72: scheda tecnica e vetro stratificato 3+3 già di serie (niente sovrapprezzo)", () => {
  const s = schedaCliente("ZENITH_PF2A_SOGLIA_UKW13");
  assert.equal(s?.chiave, "ZENITH");
  assert.equal(s?.pdf, "/cataloghi/zenith/Zenith72-scheda-tecnica.pdf");
  assert.deepEqual(s?.pagine, ["/cataloghi/zenith/pagine/p-1.jpg"]);
  assert.match(s?.descrizione ?? "", /3\+3 basso emissivo \/ 18 gas argon \/ 3\+3/);
  const o = optionalZenith();
  assert.ok(!o.some((x) => x.nome.startsWith("Vetro stratificato")), "lo stratificato 3+3 è di serie");
  assert.ok(o.some((x) => x.nome.startsWith("Vetrocamera stratificato di sicurezza 3+3") && x.valore === 0));
  for (const voci of [optionalOptima(), optionalFidra(), optionalPlasma30()]) {
    assert.ok(voci.some((x) => x.nome === "Vetro stratificato di sicurezza 3+3 (di serie)" && x.valore === 0), "stratificato di serie anche negli altri listini");
    assert.ok(!voci.some((x) => x.nome.startsWith("Vetro stratificato") && x.valore > 0), "mai a pagamento");
  }
});

test("listini serramenti unificati: le stesse 2 tendine (Finestre/Portefinestre → tipo di anta) per Zenith, Optima, Fidra e Plasma 30", async () => {
  const { assiSelezioneZenith } = await import("../../src/lib/prodotti");
  assert.deepEqual(assiSelezioneZenith("OPTIMA_PF2A_SOGLIA"), { categoria: { valore: "PORTEFINESTRE", label: "Portefinestre" }, modello: { valore: "PF2A_SOGLIA", label: "Portafinestra 2 ante — soglia ribassata" } });
  assert.equal(assiSelezioneZenith("FIDRA_F1A")?.categoria.valore, "FINESTRE");
  assert.equal(assiSelezioneZenith("PLASMA30TV_W")?.modello.valore, "W");
  assert.equal(assiSelezioneZenith("PLASMA30_PF3A")?.categoria.valore, "PORTEFINESTRE");
  assert.equal(assiSelezioneZenith("ZENITH_F2A_UKW13")?.modello.valore, "F2A");
  assert.equal(assiSelezioneZenith("TAGLIOFREDDO_SCORR_33"), null);
});

test("Fidra: scheda tecnica allegabile come lo Zenith", () => {
  const s = schedaCliente("FIDRA_PF2A_SOGLIA");
  assert.equal(s?.chiave, "FIDRA");
  assert.equal(s?.pdf, "/cataloghi/fidra/Fidra-scheda-tecnica.pdf");
  assert.deepEqual(s?.pagine, ["/cataloghi/fidra/pagine/p-1.jpg", "/cataloghi/fidra/pagine/p-2.jpg"]);
  assert.match(s?.descrizione ?? "", /PVC riciclato/);
});
