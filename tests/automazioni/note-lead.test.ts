import { test } from "node:test";
import assert from "node:assert/strict";
import { leggiNoteLead, domandaLeggibile, provenienzaLead } from "../../src/lib/automazioni/note-lead";

const META = "Meta Lead Ads · Campagna: CONTATTI · city: Milan · quale_prodotto_le_interessa?: vetrate · post_code: 20142 · la_casa_dove_vuoi_fare_i_lavori_si_trova_in_lombardia?: si · inbox_url: https://business.facebook.com/latest/2946?nav_ref=thread";

test("risposte del modulo Meta come elenco, con domande leggibili", () => {
  const n = leggiNoteLead(META);
  assert.equal(n.fonte, "Meta Lead Ads");
  assert.equal(n.campagna, "CONTATTI");
  assert.deepEqual(n.risposte.map((r) => [r.domanda, r.risposta]), [
    ["Città", "Milan"], ["Quale prodotto le interessa?", "vetrate"], ["CAP", "20142"],
    ["La casa dove vuoi fare i lavori si trova in lombardia?", "si"], ["Conversazione su Meta", "https://business.facebook.com/latest/2946?nav_ref=thread"],
  ]);
  assert.ok(n.risposte.at(-1)!.link);
});

test("note del centralino datate separate dalle risposte", () => {
  const n = leggiNoteLead(`${META}\n[03/11/2026 Cristina Rege] 03/11/2026 14.55 - MEX PRE CHIAMATA 15.49 - VETRATA\n[03/11/2026 Cristina Rege] APP ANNULLATO DA RISENTIRE`);
  assert.equal(n.noteDatate.length, 2);
  assert.deepEqual(n.noteDatate[0], { data: "03/11/2026", autore: "Cristina Rege", testo: "03/11/2026 14.55 - MEX PRE CHIAMATA 15.49 - VETRATA" });
  assert.equal(n.risposte.length, 5);
});

test("form del sito e testo libero", () => {
  const n = leggiNoteLead("Pergola bioclimatica · Campagna: autunno · Vorrei un sopralluogo il sabato");
  assert.equal(n.campagna, "autunno");
  assert.deepEqual(n.altro, ["Pergola bioclimatica", "Vorrei un sopralluogo il sabato"]);
  assert.deepEqual(leggiNoteLead(null), { fonte: null, campagna: null, risposte: [], noteDatate: [], altro: [] });
});

test("domande e provenienza", () => {
  assert.equal(domandaLeggibile("post_code"), "CAP");
  assert.equal(domandaLeggibile("orario_preferito"), "Orario preferito");
  assert.equal(provenienzaLead("FACEBOOK", leggiNoteLead(META)), "da Meta Lead Ads · FACEBOOK (campagna CONTATTI)");
  assert.equal(provenienzaLead("sito", leggiNoteLead("")), "da sito");
});
