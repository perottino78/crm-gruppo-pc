import { test } from "node:test";
import assert from "node:assert/strict";
import { clientiPerSituazione, whereCampagna } from "../../src/lib/campagne/regole";
import { azioneRichiamo } from "../../src/lib/campagne/richiamo";
import { costiPerCanale, haAppuntamento, limitiMese, meseValido } from "../../src/lib/marketing/costi";

test("situazione del contatto: offerta non chiusa, ha comprato, mai comprato", () => {
  const offerte = ["a", "b", "c", "a"], comprati = ["b", "z"];
  assert.deepEqual(clientiPerSituazione("OFFERTA_APERTA", offerte, comprati), { soloClienti: ["a", "c"] });
  assert.deepEqual(clientiPerSituazione("HA_COMPRATO", offerte, comprati), { soloClienti: ["b", "z"] });
  assert.deepEqual(clientiPerSituazione("MAI_COMPRATO", offerte, comprati), { escludiClienti: ["b", "z"] });
  assert.deepEqual(clientiPerSituazione(null, offerte, comprati), {});
  // lista vuota = nessuno (non «tutti»)
  const w = whereCampagna({ marchi: [], stati: [], categorie: [], soloClienti: [] });
  assert.deepEqual(w, { AND: [{ id: { in: [] } }] });
});

test("chi clicca: crea, riapre, anticipa o lascia stare chi ha l'appuntamento", () => {
  assert.equal(azioneRichiamo(null), "CREA");
  assert.equal(azioneRichiamo({ fase: "NON_INTERESSATO" }), "RIAPRI");
  assert.equal(azioneRichiamo({ fase: "FUORI_REGIONE" }), "RIAPRI");
  assert.equal(azioneRichiamo({ fase: "DA_RICHIAMARE" }), "ANTICIPA");
  assert.equal(azioneRichiamo({ fase: "RECUPERO" }), "ANTICIPA");
  assert.equal(azioneRichiamo({ fase: "APPUNTAMENTO_CASA" }), "SOLO_NOTA");
  assert.equal(azioneRichiamo({ fase: "APPUNTAMENTO_TELEFONICO" }), "SOLO_NOTA");
});

test("costo per canale: lead, appuntamenti, contratti, € per contratto e resa", () => {
  const L = (canale: string, fase: string, contratto = false, fatturato = 0, app: Date | null = null) => ({ canale, fase, appuntamentoIl: app, contratto, fatturato });
  const righe = costiPerCanale([
    L("FACEBOOK", "NON_RISPONDE"), L("FACEBOOK", "NON_INTERESSATO"), L("FACEBOOK", "APPUNTAMENTO_CASA"), L("FACEBOOK", "NON_INTERESSATO", true, 8000, new Date()),
    L("CAMPAGNA", "APPUNTAMENTO_SHOWROOM", true, 5000), L("CAMPAGNA", "RECUPERO"),
  ], { FACEBOOK: 400, GOOGLE: 100 });
  const fb = righe.find((r) => r.canale === "FACEBOOK")!;
  assert.deepEqual([fb.lead, fb.appuntamenti, fb.contratti, fb.costoLead, fb.costoAppuntamento, fb.costoContratto, fb.resa], [4, 2, 1, 100, 200, 400, 20]);
  const camp = righe.find((r) => r.canale === "CAMPAGNA")!;
  assert.deepEqual([camp.lead, camp.appuntamenti, camp.contratti, camp.spesa, camp.costoContratto], [2, 1, 1, 0, null]);
  const g = righe.find((r) => r.canale === "GOOGLE")!;
  assert.deepEqual([g.lead, g.spesa, g.costoContratto], [0, 100, null]);
  assert.equal(righe[0].canale, "FACEBOOK"); // ordinati per spesa
  assert.equal(haAppuntamento({ fase: "APPUNTAMENTO_ANNULLATO", appuntamentoIl: null, contratto: false }), true);
  assert.equal(haAppuntamento({ fase: "DA_RICHIAMARE", appuntamentoIl: null, contratto: false }), false);
  assert.deepEqual(limitiMese("2026-12"), { dal: new Date("2026-12-01T00:00:00Z"), al: new Date("2027-01-01T00:00:00Z") });
  assert.equal(meseValido("2026-13"), false);
  assert.equal(meseValido("2026-11"), true);
});
