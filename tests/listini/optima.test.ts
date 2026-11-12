import { test } from "node:test";
import assert from "node:assert/strict";
import prodotti from "../../prisma/seed-data/optima_prodotti.json";
import fidra from "../../prisma/seed-data/fidra_prodotti.json";
import { TIPOLOGIE_OPTIMA, listiniOptima, optionalOptima, labelOptima, COEFFICIENTE_OPTIMA } from "../../src/lib/listini/optima";
import { sottogruppoDiTipologia, labelBreveTipologia, listinoDiTipologia, unitaMisura, notaInArrivo } from "../../src/lib/prodotti";

type P = { tipologia: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number };
const righe = prodotti as P[];
const prezzo = (t: string, L: number, H: number) => righe.find((p) => p.tipologia === t && p.larghezzaMm === L && p.altezzaMm === H)?.prezzoBase;

test("griglie come nel listino Optima 70 (base × 1,35)", () => {
  assert.equal(prezzo("OPTIMA_F1A", 800, 1200), 518.4);
  assert.equal(prezzo("OPTIMA_FF", 700, 700), 232.2);
  assert.equal(prezzo("OPTIMA_PF2A_SOGLIA", 700, 1600), 1043.55);
  assert.equal(prezzo("OPTIMA_PF1A_SOGLIA", 700, 1500), 754.65);
  assert.equal(prezzo("OPTIMA_PF3A", 1200, 1500), 1848.15);
  assert.equal(prezzo("OPTIMA_TRASLANTE", 1600, 1500), 2092.5);
});

test("«*» = primo prezzo disponibile, «-» non eseguibile", () => {
  assert.equal(prezzo("OPTIMA_F1A", 500, 500), 400.95);
  assert.equal(prezzo("OPTIMA_FF", 500, 500), 298.35);
  assert.equal(prezzo("OPTIMA_F2A", 1100, 500), undefined);
});

test("stessa base del listino Fidra: Optima = base × 1,35 (Fidra = base × 2,2)", () => {
  const f = fidra as P[];
  let confrontati = 0;
  const diverse: string[] = [];
  for (const p of righe) {
    const q = f.find((x) => x.tipologia === p.tipologia.replace("OPTIMA_", "FIDRA_") && x.larghezzaMm === p.larghezzaMm && x.altezzaMm === p.altezzaMm);
    if (!q) continue;
    confrontati++;
    if (Math.abs(p.prezzoBase / COEFFICIENTE_OPTIMA - q.prezzoBase / 2.2) >= 0.02) diverse.push(`${p.tipologia} ${p.larghezzaMm}×${p.altezzaMm}`);
  }
  assert.ok(confrontati > 2000, String(confrontati));
  // unica cella diversa, nei file così come sono arrivati (2 € di base); il refuso Fidra 900×800 è corretto in estrai_fidra.py
  assert.deepEqual(diverse.sort(), ["OPTIMA_PF3A_SOGLIA 2400×2300"]);
});

test("tutte le tipologie hanno griglia, etichetta e sottogruppo; il segnaposto «in arrivo» non c'è più", () => {
  for (const t of Object.keys(TIPOLOGIE_OPTIMA)) {
    assert.ok(righe.filter((p) => p.tipologia === t).length > 50, t);
    assert.equal(sottogruppoDiTipologia(t), "PVC — Optima 70");
    assert.equal(labelBreveTipologia(t), labelOptima(t));
    assert.equal(listinoDiTipologia(t), "OPTIMA");
    assert.equal(unitaMisura(t), "mm");
  }
  assert.equal(new Set(righe.map((p) => `${p.tipologia}|${p.larghezzaMm}|${p.altezzaMm}`)).size, righe.length);
  assert.equal(notaInArrivo("SERRAMENTI_PVC_OPTIMA_PLACEHOLDER"), null);
});

test("optional: pellicole +20%, satinato 90 € finestre / 150 € portefinestre, maniglia su tutti, motore solo wasistas", () => {
  const opt = optionalOptima();
  const visibili = (t: string) => opt.filter((o) => listiniOptima(t).includes(o.listino));
  assert.ok(visibili("OPTIMA_F1A").filter((o) => o.nome.endsWith("— pellicola")).every((o) => o.tipoPrezzo === "PERCENTUALE" && o.valore === 20));
  assert.equal(visibili("OPTIMA_F2A").find((o) => o.nome.startsWith("Vetro satinato"))?.valore, 90);
  assert.equal(visibili("OPTIMA_PF2A").find((o) => o.nome.startsWith("Vetro satinato"))?.valore, 150);
  assert.ok(visibili("OPTIMA_F1A").some((o) => o.nome.startsWith("Maniglia passante")));
  assert.ok(visibili("OPTIMA_PF1A").some((o) => o.nome.startsWith("Pannello fisso")));
  assert.ok(!visibili("OPTIMA_F1A").some((o) => o.nome.startsWith("Pannello fisso")));
  assert.ok(visibili("OPTIMA_W").some((o) => o.nome.startsWith("Motore per wasistas")));
  assert.ok(!visibili("OPTIMA_F1A").some((o) => o.nome.startsWith("Motore per wasistas")));
  assert.equal(visibili("OPTIMA_F1A").find((o) => o.nome.startsWith("Autoscala dal 3°"))?.valore, 700);
  assert.equal(new Set(opt.map((o) => `${o.listino}|${o.categoria}|${o.nome}`)).size, opt.length);
});

test("descrizione breve e scheda tecnica per il cliente nell'offerta", async () => {
  const { schedaCliente } = await import("../../src/lib/preventivi/scheda-cliente");
  const s = schedaCliente("OPTIMA_F2A");
  assert.ok(s && /5 camere/.test(s.descrizione) && /Uf 1,3/.test(s.descrizione));
  assert.equal(s?.pdf, "/cataloghi/optima/Optima70-scheda-tecnica.pdf");
  assert.equal(s?.pagine.length, 8);
  assert.equal(schedaCliente("FIDRA_F2A"), null);
});

test("schede da allegare: una per listino e solo se il prodotto è ancora nell'offerta", async () => {
  const { schedeDelleTipologie, schedeDaAllegare } = await import("../../src/lib/preventivi/scheda-cliente");
  assert.deepEqual(schedeDelleTipologie(["OPTIMA_F1A", "FIDRA_F1A", "OPTIMA_PF2A", null]).map((s) => s.chiave), ["OPTIMA"]);
  assert.equal(schedeDaAllegare(["OPTIMA"], ["OPTIMA_F1A"]).length, 1);
  assert.equal(schedeDaAllegare(["OPTIMA"], ["FIDRA_F1A"]).length, 0);
  assert.equal(schedeDaAllegare([], ["OPTIMA_F1A"]).length, 0);
});
