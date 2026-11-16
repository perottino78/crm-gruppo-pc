import { test } from "node:test";
import assert from "node:assert/strict";
import { percorsoProgetto, praticaLegacy, type DatiPercorso } from "../../src/lib/progetti/percorso";

const base: DatiPercorso = { viaLibera: true, progettoCreatoIl: null, materialeConfermatoIl: null, legacy: false, rilievi: [], righe: 0, righeSenzaFornitore: 0, righeOrdinate: 0, righeArrivate: 0, righeTotali: 0, materialeCompleto: false };
const adesso = new Date();
const aperto: DatiPercorso = { ...base, progettoCreatoIl: adesso };
const pronto: DatiPercorso = { ...aperto, rilievi: [{ stato: "ESEGUITO" }], righe: 5, righeTotali: 5 };

test("prima dell'acconto il progetto non si crea; dopo compare «Crea progetto»", () => {
  assert.equal(percorsoProgetto({ ...base, viaLibera: false }).etichetta, "In attesa dell'acconto");
  const p = percorsoProgetto(base);
  assert.equal(p.fase, "DA_CREARE");
  assert.equal(p.ordiniBloccati, true, "senza progetto non si ordina");
});

test("percorso: rilievo → rilievi → materiale → ordini → arrivo in magazzino", () => {
  let p = percorsoProgetto(aperto);
  assert.equal(p.etichetta, "Rilievo da fissare");
  assert.deepEqual(p.passi.map((x) => x.stato), ["ORA", "IN_ATTESA", "IN_ATTESA", "IN_ATTESA", "IN_ATTESA"]);
  assert.equal(percorsoProgetto({ ...aperto, rilievi: [{ stato: "PROGRAMMATO" }] }).etichetta, "Carica i rilievi");
  assert.equal(percorsoProgetto({ ...aperto, rilievi: [{ stato: "ESEGUITO" }] }).etichetta, "Completa il materiale");
  assert.equal(percorsoProgetto({ ...pronto, righeSenzaFornitore: 2 }).puoConfermare, false, "righe senza fornitore: non si conferma");
  p = percorsoProgetto(pronto);
  assert.equal(p.puoConfermare, true);
  assert.equal(p.etichetta, "Pronto da confermare");
  assert.equal(p.ordiniBloccati, true, "ordini bloccati finché non si conferma");
  const conf = { ...pronto, materialeConfermatoIl: adesso };
  p = percorsoProgetto(conf);
  assert.equal(p.ordiniBloccati, false);
  assert.equal(p.etichetta, "Da ordinare");
  assert.equal(p.passi[3].stato, "ORA");
  p = percorsoProgetto({ ...conf, righeOrdinate: 5 });
  assert.equal(p.etichetta, "Ordinato: in attesa del materiale");
  assert.equal(p.passi[4].dettaglio, "0 righe su 5 arrivate.");
  p = percorsoProgetto({ ...conf, righeOrdinate: 5, righeArrivate: 5, materialeCompleto: true });
  assert.equal(p.fase, "COMPLETO");
  assert.equal(p.etichetta, "Materiale in magazzino");
  assert.ok(p.passi.every((x) => x.stato === "FATTO"));
});

test("un rilievo annullato non conta; le pratiche già avviate non hanno blocchi", () => {
  assert.equal(percorsoProgetto({ ...aperto, rilievi: [{ stato: "ANNULLATO" }] }).passi[0].stato, "ORA");
  assert.equal(praticaLegacy({ progettoCreatoIl: null, rilievi: 1, righe: 0, ordini: 0 }), true);
  assert.equal(praticaLegacy({ progettoCreatoIl: null, rilievi: 0, righe: 0, ordini: 0 }), false);
  assert.equal(praticaLegacy({ progettoCreatoIl: adesso, rilievi: 1, righe: 3, ordini: 1 }), false);
  assert.equal(percorsoProgetto({ ...aperto, legacy: true }).ordiniBloccati, false);
});
