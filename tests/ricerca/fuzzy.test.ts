import { test } from "node:test";
import assert from "node:assert/strict";
import { distanza, punteggio, trovaSimili } from "../../src/lib/ricerca/fuzzy";
import { voceEsito } from "../../src/lib/lead/cronologia";

test("distanza: errori, lettere scambiate", () => {
  assert.equal(distanza("rossi", "rossi"), 0);
  assert.equal(distanza("rosi", "rossi"), 1);
  assert.equal(distanza("mraio", "mario"), 1);
  assert.equal(distanza("bianchi", "bainchi"), 1);
});

test("punteggio: trova con una o due lettere sbagliate, in qualsiasi ordine", () => {
  assert.ok(punteggio("Rosi Mraio", "Rossi Mario") > 0);
  assert.ok(punteggio("mario rossi", "ROSSI MARIO") > 0);
  assert.ok(punteggio("perottni", "Ugo Perottino") > 0);
  assert.ok(punteggio("Piccati", "Marco Piccatti") > 0);
  assert.equal(punteggio("Bianchi", "Rossi Mario"), 0);
  assert.equal(punteggio("Ros", "Russo"), 0, "parole corte: nessun errore ammesso");
  assert.ok(punteggio("ros", "Rossi") > 0, "inizio della parola");
  assert.ok(punteggio("Rossi Mario", "Rossi Mario") > punteggio("Rosi Mario", "Rossi Mario"));
});

test("trovaSimili: ordine per somiglianza, esclusi i già trovati, niente approssimazione per telefoni ed email", () => {
  const righe = [{ id: "1", nome: "Rossi Mario" }, { id: "2", nome: "Rosso Maria" }, { id: "3", nome: "Verdi Luca" }];
  const ids = trovaSimili("Rosi Mario", righe, (r) => r.nome);
  assert.equal(ids[0], "1");
  assert.ok(!ids.includes("3"));
  assert.deepEqual(trovaSimili("Rossi", righe, (r) => r.nome, 20, new Set(["1"])).includes("1"), false);
  assert.deepEqual(trovaSimili("3331234567", righe, (r) => r.nome), []);
  assert.deepEqual(trovaSimili("a@b.it", righe, (r) => r.nome), []);
});

test("cronologia: titolo = esito, corpo solo se ci sono dettagli", () => {
  assert.deepEqual(voceEsito("Non risponde"), { titolo: "Non risponde", corpo: null });
  assert.deepEqual(voceEsito("Appuntamento fissato a CASA — 12/11/26, 10:00 con Marco Piccatti · citofono Rossi"), { titolo: "Appuntamento fissato a CASA", corpo: "12/11/26, 10:00 con Marco Piccatti · citofono Rossi" });
  assert.deepEqual(voceEsito("Appuntamento da fissare (ricontatto) — 14/11/26, 18:00 · nessuna email al cliente"), { titolo: "Appuntamento da fissare (ricontatto)", corpo: "14/11/26, 18:00 · nessuna email al cliente" });
  assert.deepEqual(voceEsito("Annullato (Marco, appuntamento del gio 12 nov 10:00)"), { titolo: "Appuntamento annullato", corpo: "(Marco, appuntamento del gio 12 nov 10:00)" });
  assert.deepEqual(voceEsito("Da rifissare (Marco, appuntamento del gio 12 nov 10:00): c'era solo la moglie").titolo, "Appuntamento da rifissare");
  assert.equal(voceEsito("In target").corpo, null);
});
