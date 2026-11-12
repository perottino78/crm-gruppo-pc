import { test } from "node:test";
import assert from "node:assert/strict";
import prodotti from "../../prisma/seed-data/plasma30_prodotti.json";
import optima from "../../prisma/seed-data/optima_prodotti.json";
import { TIPOLOGIE_PLASMA30, listiniPlasma30, optionalPlasma30, labelPlasma30, ePlasma30, triploVetro } from "../../src/lib/listini/plasma30";
import { sottogruppoDiTipologia, labelBreveTipologia, listinoDiTipologia, unitaMisura, notaInArrivo } from "../../src/lib/prodotti";
import { schedaCliente, schedeDaAllegare } from "../../src/lib/preventivi/scheda-cliente";

type P = { tipologia: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number };
const righe = prodotti as P[];
const prezzo = (t: string, L: number, H: number) => righe.find((p) => p.tipologia === t && p.larghezzaMm === L && p.altezzaMm === H)?.prezzoBase;

test("griglie come nei listini Plasma 30 (doppio vetro UKW 1.3, triplo vetro UKW 1.0)", () => {
  assert.equal(prezzo("PLASMA30_F1A", 800, 1200), 1036.8);
  assert.equal(prezzo("PLASMA30TV_F1A", 800, 1200), 1152);
  assert.equal(prezzo("PLASMA30_FF", 700, 700), 464.4);
  assert.equal(prezzo("PLASMA30TV_PF3A_SOGLIA", 1200, 1500), 4326);
  assert.equal(prezzo("PLASMA30_F1A", 500, 500), 801.9); // «*» = primo prezzo disponibile
  assert.equal(prezzo("PLASMA30_F2A", 1100, 500), undefined); // «-» non eseguibile
  assert.equal(prezzo("PLASMA30_F2A", 900, 800), 1317.6); // refuso «937» del file corretto con la progressione
});

test("doppio vetro = stessa base dell'Optima 70 × 2,7 (Optima × 1,35)", () => {
  const o = optima as P[];
  const diverse: string[] = [];
  let confrontati = 0;
  for (const p of righe.filter((x) => x.tipologia.startsWith("PLASMA30_"))) {
    const q = o.find((x) => x.tipologia === p.tipologia.replace("PLASMA30_", "OPTIMA_") && x.larghezzaMm === p.larghezzaMm && x.altezzaMm === p.altezzaMm);
    if (!q) continue;
    confrontati++;
    if (Math.abs(p.prezzoBase / 2.7 - q.prezzoBase / 1.35) >= 0.02) diverse.push(`${p.tipologia} ${p.larghezzaMm}×${p.altezzaMm}`);
  }
  assert.ok(confrontati > 2500, String(confrontati));
  assert.deepEqual(diverse, ["PLASMA30_PF3A_SOGLIA 2400×2300"]); // come nel file (2 € di base), uguale all'Optima
});

test("24 tipologie con griglia, etichetta e sottogruppo; il segnaposto «in arrivo» non c'è più", () => {
  assert.equal(Object.keys(TIPOLOGIE_PLASMA30).length, 24);
  for (const t of Object.keys(TIPOLOGIE_PLASMA30)) {
    assert.ok(righe.filter((p) => p.tipologia === t).length > 50, t);
    assert.equal(sottogruppoDiTipologia(t), triploVetro(t) ? "PVC — Plasma 30 triplo vetro" : "PVC — Plasma 30");
    assert.equal(labelBreveTipologia(t), labelPlasma30(t));
    assert.equal(listinoDiTipologia(t), "PLASMA30");
    assert.equal(unitaMisura(t), "mm");
  }
  assert.equal(labelPlasma30("PLASMA30TV_F2A"), "Plasma 30 triplo vetro — Finestra 2 ante");
  assert.ok(!ePlasma30("PLASMA30ALU_X") && !ePlasma30("OPTIMA_F1A"));
  assert.equal(new Set(righe.map((p) => `${p.tipologia}|${p.larghezzaMm}|${p.altezzaMm}`)).size, righe.length);
  assert.equal(notaInArrivo("SERRAMENTI_PVC_PLASMA30_PLACEHOLDER"), null);
});

test("optional come l'Optima, colori con le regole del listino Plasma 30", () => {
  const opt = optionalPlasma30();
  const visibili = (t: string) => opt.filter((o) => listiniPlasma30(t).includes(o.listino));
  const f = visibili("PLASMA30_F1A");
  assert.equal(f.find((o) => o.nome.startsWith("Avorio"))?.valore, 5);
  assert.equal(f.find((o) => o.nome === "Rovere gold (AP 23) — pellicola su un lato")?.valore, 15);
  assert.equal(f.find((o) => o.nome === "Rovere gold (AP 23) — pellicola sui due lati uguali")?.valore, 20);
  assert.equal(f.find((o) => o.nome.startsWith("Rovere grigio (AP 94)"))?.valore, 30);
  assert.equal(f.find((o) => o.nome.startsWith("Pellicole diverse"))?.valore, 100);
  assert.equal(f.find((o) => o.nome.startsWith("Vetro satinato"))?.valore, 90);
  assert.equal(visibili("PLASMA30TV_PF2A").find((o) => o.nome.startsWith("Vetro satinato"))?.valore, 150);
  assert.ok(visibili("PLASMA30_W").some((o) => o.nome.startsWith("Motore per wasistas")));
  assert.ok(!f.some((o) => o.nome.startsWith("Motore per wasistas") || o.nome.startsWith("Pannello fisso")));
  assert.equal(f.find((o) => o.nome.startsWith("Oltre"))?.valore, 300);
  assert.equal(visibili("PLASMA30TV_PF3A_SOGLIA").find((o) => o.nome.startsWith("Oltre"))?.valore, 400);
  assert.equal(f.find((o) => o.nome.startsWith("Serramento curvo"))?.valore, 40);
  assert.equal(new Set(opt.map((o) => `${o.listino}|${o.categoria}|${o.nome}`)).size, opt.length);
});

test("scheda tecnica Plasma 30: descrizione per doppio e triplo vetro, allegata una volta sola", () => {
  const d = schedaCliente("PLASMA30_F2A"), t = schedaCliente("PLASMA30TV_F2A");
  assert.ok(d && t && /Uf 1,0/.test(d.descrizione) && /doppia/.test(d.descrizione) && /triplo vetro/.test(t.descrizione));
  assert.equal(d?.pdf, "/cataloghi/plasma30/Plasma30-scheda-tecnica.pdf");
  assert.equal(d?.pagine.length, 16);
  assert.equal(schedeDaAllegare([{ tipologia: "PLASMA30_F1A", allegaScheda: true }, { tipologia: "PLASMA30TV_PF2A", allegaScheda: true }, { tipologia: "OPTIMA_F1A", allegaScheda: true }]).length, 2);
});
