import test from "node:test";
import assert from "node:assert/strict";
import { SEZIONI_VERBALE, verbaleDaForm, verbaleCompilato, righeIniziali, verbaleDiPartenza, riassuntoSezione } from "../../src/lib/rilievo/verbale";

const form = (dati: Record<string, string | string[]>) => ({
  get: (k: string) => { const v = dati[k]; return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : null; },
  getAll: (k: string) => { const v = dati[k]; return typeof v === "string" ? [v] : Array.isArray(v) ? v : []; },
});

test("il verbale ha le sezioni del modulo cartaceo con le spunte", () => {
  assert.equal(SEZIONI_VERBALE.length, 5);
  const tipo = SEZIONI_VERBALE[0].campi[0];
  assert.ok(tipo.tipo === "spunte" && tipo.opzioni.includes("Vetrata Panoramica (VP)") && tipo.opzioni.length === 12);
});

test("legge spunte, testi e righe; scarta le opzioni inventate", () => {
  const f = form({ v_intervento: ["Serramenti PVC", "Tapparelle", "Inventata"], v_piano: "3", v_note_stato: "Crepa in cucina", vr_1_tipo: "Finestra cucina", vr_1_larg: "1200", vr_1_alt: "1400", vr_1_q: "2", vr_3_tipo: "Porta", v_rif_interno: "Mario" });
  const v = verbaleDaForm(f.get, f.getAll);
  assert.deepEqual(v.campi.intervento, ["Serramenti PVC", "Tapparelle"]);
  assert.equal(v.campi.piano, "3");
  assert.equal(v.righe.length, 2);
  assert.equal(v.righe[0].larg, "1200");
  assert.equal(v.rif_interno, "Mario");
  assert.ok(verbaleCompilato(v));
});

test("modulo vuoto = non compilato; riassunto della sezione", () => {
  const f = form({});
  const v = verbaleDaForm(f.get, f.getAll);
  assert.equal(verbaleCompilato(v), false);
  assert.equal(riassuntoSezione(SEZIONI_VERBALE[0], { intervento: ["A", "B"], intervento_altro: "x" }), 3);
});

test("la tabella parte dai prodotti venduti, poi vale quanto salvato", () => {
  const mat = [{ descrizione: "Finestra 2 ante", quantita: 3 }];
  assert.deepEqual(righeIniziali(mat)[0], { tipo: "Finestra 2 ante", larg: "", alt: "", q: "3", note: "" });
  assert.equal(verbaleDiPartenza(null, mat).righe.length, 1);
  const salvato = { campi: { piano: "2" }, righe: [{ tipo: "Porta", larg: "900", alt: "2100", q: "1", note: "" }] };
  assert.equal(verbaleDiPartenza(salvato, mat).righe[0].tipo, "Porta");
});
