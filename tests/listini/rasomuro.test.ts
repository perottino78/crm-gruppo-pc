import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogoRasomuro, assiSelezioneRasomuro, misureRasomuro, listiniRasomuro, labelRasomuro, sottogruppoRasomuro, guidaRasomuro, TIPOLOGIA_STRIP } from "../../src/lib/listini/rasomuro";
import { sottogruppoDiTipologia, labelBreveTipologia, unitaMisura, assiSelezioneIsomax } from "../../src/lib/prodotti";

const cat = catalogoRasomuro();
const prezzo = (tip: string, telaio: string) => cat.prodotti.find((p) => p.tipologia === tip && p.colore.startsWith(telaio))?.prezzoBase;
const opt = (tip: string, nome: string) => cat.optional.find((o) => o.listino === tip && o.nome.startsWith(nome))?.valore;

test("MYA battente H 215: telai e finiture come da listino", () => {
  assert.equal(prezzo("RASOMURO_MYA_BATT_H215", "Telaio filo muro sp. 44"), 865);
  assert.equal(prezzo("RASOMURO_MYA_BATT_H215", "Telaio centro muro"), 1309);
  assert.equal(opt("RASOMURO_MYA_BATT_H215", "Laminato CPL"), 99);
  assert.equal(opt("RASOMURO_MYA_BATT_H215", "Vetro opaco"), 2260);
  assert.equal(opt("RASOMURO_MYA_BATT_H245", "Laminato CPL"), undefined); // «-» nel listino
});

test("2 ante = prezzo 1 anta × 2 (telaio, finitura e su misura)", () => {
  assert.equal(prezzo("RASOMURO_MYA_BATT2A_H215", "Telaio filo muro sp. 44"), 1730);
  assert.equal(opt("RASOMURO_MYA_BATT2A_H215", "Laccato opaco"), 826);
  assert.equal(opt("RASOMURO_KIUSO_K200_H098", "Laminato CPL"), 220);
});

test("scorrevole centro muro: solo telaio, anta a parte", () => {
  assert.equal(prezzo("RASOMURO_MYA_SCI_H210", "Telaio per parete in muratura"), 1110);
  assert.equal(prezzo("RASOMURO_MYA_SCI_H210", "Senza telaio"), 0);
  assert.equal(opt("RASOMURO_MYA_SCI_H210", "Anta sovraverniciabile"), 327);
  assert.equal(opt("RASOMURO_MYA_SCI_H260", "Vetro opaco"), 3445);
  assert.match(guidaRasomuro("RASOMURO_MYA_SCI_H210")!, /SOLO telaio/);
});

test("tendine e misure", () => {
  assert.deepEqual(assiSelezioneRasomuro("RASOMURO_MYA_BILU_H305XL"), {
    modello: { valore: "MYA_BILU", label: "MYA Bilico unidirezionale" },
    apertura: { valore: "H305XL", label: "L 148-158-168-178-188 × H 305" },
  });
  assert.deepEqual(assiSelezioneIsomax("RASOMURO_MYA_BATT_H215")?.modello.valore, "MYA_BATT");
  assert.deepEqual(misureRasomuro("RASOMURO_KIUSO_K100_H148"), { larghezze: [38, 48, 58, 68, 78], altezze: [108, 118, 128, 138, 148], perAnta: false });
  assert.equal(misureRasomuro(TIPOLOGIA_STRIP), null);
  assert.equal(sottogruppoDiTipologia("RASOMURO_KIUSO_K100_H098"), "Raso muro — KIUSO chiusure");
  assert.equal(sottogruppoRasomuro(TIPOLOGIA_STRIP), "Raso muro — STRIP battiscopa");
  assert.equal(labelBreveTipologia("RASOMURO_MYA_SCE_H245"), labelRasomuro("RASOMURO_MYA_SCE_H245"));
  assert.equal(unitaMisura("RASOMURO_MYA_SCE_H245"), "cm");
});

test("accessori giusti per ogni porta", () => {
  assert.ok(listiniRasomuro("RASOMURO_MYA_BATT_H215").includes("RASOMURO_MYA_BATT"));
  assert.ok(listiniRasomuro("RASOMURO_MYA_PIEG_H215").includes("RASOMURO_MYA_BPB"));
  assert.ok(!listiniRasomuro("RASOMURO_MYA_PIEG_H215").includes("RASOMURO_MYA_BATT"));
  assert.ok(listiniRasomuro("RASOMURO_MYA_SCE_H215").includes("RASOMURO_MYA_SC"));
  assert.ok(!listiniRasomuro("RASOMURO_KIUSO_K100_H098").includes("RASOMURO_MYA"));
  assert.deepEqual(listiniRasomuro("ISOMAX_SKL_BATT"), []);
});

test("catalogo senza doppioni e con tutte le foto", () => {
  const chiavi = cat.prodotti.map((p) => `${p.tipologia}|${p.colore}`);
  assert.equal(new Set(chiavi).size, chiavi.length);
  const chiaviO = cat.optional.map((o) => `${o.listino}|${o.categoria}|${o.nome}`);
  assert.equal(new Set(chiaviO).size, chiaviO.length);
  assert.ok(cat.prodotti.every((p) => p.prezzoBase >= 0 && p.altezzaMm === 0 && p.larghezzaMm === 0));
  assert.equal(new Set(cat.prodotti.map((p) => p.tipologia)).size, cat.modelli.length);
  assert.ok(cat.optional.some((o) => o.nome.startsWith("B 130 C Cerniera a scomparsa")));
});
