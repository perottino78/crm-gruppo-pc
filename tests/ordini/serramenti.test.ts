import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELLO_SERRAMENTI, N_FINESTRE, COLONNE_FINESTRA, COPRIFILI, APERTURE } from "../../src/lib/ordini/serramenti";
import { compilaScheda, descriviCampi, raggruppaCampi, MODELLI_PRONTI } from "../../src/lib/ordini/scheda-produzione";

test("il modello serramenti ha tutti i campi del modulo cartaceo", () => {
  const campi = descriviCampi(MODELLO_SERRAMENTI);
  const nomi = campi.map((c) => c.nome);
  for (const n of ["responsabile_ordine", "data_rilievo", "rilievo_eseguito_da", "tipologia_vetro", "colore_maniglie", "foro", "note"]) assert.ok(nomi.includes(n), n);
  assert.equal(campi.find((c) => c.nome === "tipologia_vetro")?.opzioni.length, 3);
  assert.equal(campi.find((c) => c.nome === "foro")?.tipo, "multi");
  const { tabelle } = raggruppaCampi(nomi);
  const fin = tabelle.find((t) => t.gruppo === "fin")!;
  assert.equal(fin.righe.length, N_FINESTRE);
  assert.deepEqual(fin.colonne.slice().sort(), COLONNE_FINESTRA.map((c) => c.nome).sort());
  assert.equal(tabelle.find((t) => t.gruppo === "cop")!.righe.length, COPRIFILI.length);
  assert.ok(MODELLI_PRONTI.some((m) => m.chiave === "serramenti"));
  assert.equal(APERTURE.flatMap((g) => g.codici).length, 21);
});

test("la scheda compilata tiene solo le finestre scritte (la prima resta sempre) e mostra le scelte con ☒ ☐", () => {
  const valori = {
    tipologia_vetro: "44.2/16/4BE 39db", colore_maniglie: "BRONZO", foro: "AEREAZIONE 160,5|PASSACANE",
    tab_fin_1_stanza: "Soggiorno", tab_fin_1_L: "1200", tab_fin_1_H: "1400", tab_fin_1_apertura: "2S", tab_fin_1_stc: "STC",
    tab_fin_3_stanza: "Cucina", tab_fin_3_L: "900", tab_fin_3_H: "1300", tab_cop_1_qta: "4", tab_cop_1_col: "bianco",
  };
  const h = compilaScheda(MODELLO_SERRAMENTI, valori, "");
  assert.equal((h.match(/class="r1"/g) ?? []).length, 2, "solo finestra 1 e 3");
  assert.ok(h.includes("Soggiorno") && h.includes("Cucina") && h.includes("2S"));
  assert.ok(!h.includes("data-vuoto"));
  assert.ok(!/\{\{/.test(h), "nessun segnaposto rimasto");
  assert.ok(/&#9746; 44\.2\/16\/4BE 39db/.test(h) && /&#9744; BRONZO|&#9746; BRONZO/.test(h));
  assert.ok(/&#9746; AEREAZIONE 160,5/.test(h) && /&#9746; PASSACANE/.test(h) && /&#9744; PASSAGATTO/.test(h));
  assert.ok(/&#9746; STC/.test(h));
  // senza nulla compilato resta la prima riga
  const vuota = compilaScheda(MODELLO_SERRAMENTI, {}, "");
  assert.equal((vuota.match(/class="r1"/g) ?? []).length, 1);
});
