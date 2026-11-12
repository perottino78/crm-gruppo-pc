import { test } from "node:test";
import assert from "node:assert/strict";
import { bloccato, classifica, giorniPassati, leggiRegole, limiteGiorni, REGOLE_PREDEFINITE } from "../../src/lib/appuntamenti/esiti";
import { daOraRoma } from "../../src/lib/calendario/tempo";

const r = REGOLE_PREDEFINITE;
const app = (quando: string, stato = "PROGRAMMATO") => ({ id: "a", utenteId: "u", dataOra: daOraRoma(quando)!, stato });

test("regole: predefinite e valori sbagliati", () => {
  assert.deepEqual(leggiRegole({}), r);
  const x = leggiRegole({ esiti_giorni_promemoria: "3", esiti_giorni_lista: "1", esiti_blocco_attivo: "1", esiti_blocco_soglia: "abc", esiti_sbloccati: "[\"u1\"]", esiti_dal: "2026-12-01" });
  assert.equal(x.giorniPromemoria, 3);
  assert.equal(x.giorniLista, 3, "la lista non arriva mai prima del promemoria");
  assert.equal(x.bloccoAttivo, true);
  assert.equal(x.sogliaBlocco, 3);
  assert.deepEqual(x.sbloccati, ["u1"]);
  assert.equal(x.dal, "2026-12-01");
  assert.deepEqual(leggiRegole({ esiti_sbloccati: "non json" }).sbloccati, []);
});

test("giorni passati e limite in ora di Roma", () => {
  assert.equal(giorniPassati(daOraRoma("2026-11-12T23:30")!, "2026-11-13"), 1);
  assert.equal(giorniPassati(daOraRoma("2026-11-13T00:30")!, "2026-11-13"), 0);
  assert.equal(limiteGiorni("2026-11-13", 1).getTime(), daOraRoma("2026-11-13T00:00")!.getTime());
  assert.equal(limiteGiorni("2026-11-13", 2).getTime(), daOraRoma("2026-11-12T00:00")!.getTime());
});

test("classifica: oggi niente, il giorno dopo promemoria, dopo 2 giorni lista", () => {
  assert.equal(classifica(app("2026-11-13T10:00"), "2026-11-13", r), "NIENTE");
  assert.equal(classifica(app("2026-11-12T18:00"), "2026-11-13", r), "PROMEMORIA");
  assert.equal(classifica(app("2026-11-11T09:00"), "2026-11-13", r), "LISTA");
  assert.equal(classifica(app("2026-11-11T09:00", "COMPLETATO"), "2026-11-13", r), "NIENTE", "esitato");
  assert.equal(classifica(app("2026-11-11T09:00", "ANNULLATO"), "2026-11-13", r), "NIENTE");
  assert.equal(classifica(app("2026-11-05T09:00"), "2026-11-13", r), "NIENTE", "prima del passaggio a P&C ONE non conta");
});

test("blocco: solo se acceso, sopra soglia e non sbloccato", () => {
  assert.equal(bloccato("u", 10, r), false, "spento di serie");
  const acceso = { ...r, bloccoAttivo: true };
  assert.equal(bloccato("u", 2, acceso), false);
  assert.equal(bloccato("u", 3, acceso), true);
  assert.equal(bloccato("u", 3, { ...acceso, sbloccati: ["u"] }), false);
});
