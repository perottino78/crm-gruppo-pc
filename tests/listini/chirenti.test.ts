import { test } from "node:test";
import assert from "node:assert/strict";
import { costoMqChirenti, venditaMqChirenti, prodottiChirenti, optionalChirenti, labelChirenti, partiChirenti, descrizioneChirenti, MQ_RIFERIMENTO_CHIRENTI } from "../../src/lib/listini/chirenti";
import { schedaCliente, schedeDelleTipologie } from "../../src/lib/preventivi/scheda-cliente";

test("costo al m² ricostruisce gli imponibili dei preventivi Chirenti (2500 × 2400 = 6 m²)", () => {
  assert.equal(Math.round(costoMqChirenti("TEMP") * MQ_RIFERIMENTO_CHIRENTI), 2300); // Book temperato 26-3694
  assert.equal(Math.round(costoMqChirenti("STRAT") * MQ_RIFERIMENTO_CHIRENTI), 1985); // Book stratificato 26-3694a
  const serratura = optionalChirenti().find((o) => o.nome.startsWith("Serratura"))!;
  assert.equal(Math.round(costoMqChirenti("STRAT") * 6 + serratura.valore / 2), 2045); // Solco stratificato + serratura 26-3694b
});

test("vendita al m² e optional (ricarico 2)", () => {
  assert.equal(venditaMqChirenti("TEMP"), 767);
  assert.equal(venditaMqChirenti("STRAT"), 662);
  const p = prodottiChirenti();
  assert.equal(p.length, 4);
  assert.deepEqual(p.map((x) => `${x.tipologia}=${x.prezzoBase}`).sort(), ["VETRATA_BOOKPROCAM_STRAT=662", "VETRATA_BOOKPROCAM_TEMP=767", "VETRATA_SOLCOPROCAM_STRAT=662", "VETRATA_SOLCOPROCAM_TEMP=767"]);
  const o = optionalChirenti();
  assert.equal(o.find((x) => x.nome.startsWith("Serratura"))?.valore, 120);
  assert.ok(o.filter((x) => x.gruppo === "VETRATE BOOK PRO CAM").every((x) => !x.nome.startsWith("Serratura")), "la serratura è solo del Solco");
});

test("nomi, descrizioni e scheda tecnica", () => {
  assert.equal(labelChirenti("VETRATA_BOOKPROCAM_TEMP"), "Book Pro Cam — vetrocamera temperato 30 mm");
  assert.equal(labelChirenti("VETRATA_SOLCOPROCAM_STRAT"), "Solco Pro Cam — vetrocamera stratificato 22 mm");
  assert.equal(partiChirenti("VETRATA_SCINTILLA"), null, "Scintilla resta fuori");
  assert.match(descrizioneChirenti("VETRATA_SOLCOPROCAM_TEMP")!, /da confermare/);
  assert.doesNotMatch(descrizioneChirenti("VETRATA_SOLCOPROCAM_STRAT")!, /da confermare/);
  assert.equal(schedaCliente("VETRATA_BOOKPROCAM_STRAT")?.pdf, "/cataloghi/book-pro-cam/book-pro-cam.pdf");
  assert.equal(schedaCliente("VETRATA_SCINTILLA"), null);
  assert.equal(schedeDelleTipologie(["VETRATA_SOLCOPROCAM_TEMP", "VETRATA_SOLCOPROCAM_STRAT", "VETRATA_BOOKPROCAM_TEMP"]).length, 2, "una scheda per sistema");
});
