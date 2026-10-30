import { test } from "node:test";
import assert from "node:assert/strict";
import { PERSONALE_BCONSOLE, chiavePersona, brandDaMarchi, pianoImportUtenti, emailSegnaposto } from "../../src/lib/utenti/bconsole";

const BRAND = [{ id: "b1", nome: "P&C" }, { id: "b2", nome: "Solaris" }, { id: "b3", nome: "Purafonte" }, { id: "b4", nome: "Work & Services" }, { id: "b5", nome: "PTC" }];

test("nome riconosciuto in qualunque ordine", () => {
  assert.equal(chiavePersona("Rosa Clot Giorgia"), chiavePersona("Giorgia Rosa Clot"));
  assert.notEqual(chiavePersona("Marco Piccatti"), chiavePersona("Marco Zogno"));
});

test("marchi di Laura Pinto: Solaris, P&C, Purafonte, Work", () => {
  const laura = PERSONALE_BCONSOLE.find((p) => p.username === "lpinto")!;
  assert.deepEqual(brandDaMarchi(laura.marchi, BRAND).sort(), ["b1", "b2", "b3", "b4"]);
  assert.deepEqual(brandDaMarchi(undefined, BRAND), []);
});

test("elenco: nessun doppione e solo ruoli/uffici validi", () => {
  const user = PERSONALE_BCONSOLE.map((p) => p.username);
  assert.equal(new Set(user).size, user.length);
  const email = PERSONALE_BCONSOLE.map((p) => p.email).filter(Boolean);
  assert.equal(new Set(email).size, email.length);
  for (const n of ["mzogno", "dconvertino", "bclaudio", "colariu", "ngallo"]) assert.ok(!user.includes(n), n);
});

test("piano: crea i nuovi, completa senza toccare il ruolo, non duplica", () => {
  const esistenti = [
    { id: "u1", nome: "Ugo Perottino", email: "ugo.perottino@gruppopec.com", username: "uperottino", ruolo: "AMMINISTRATORE", ufficio: null, brandIds: [] },
    { id: "u2", nome: "Piccatti Marco", email: "marco@altro.it", username: null, ruolo: "AMMINISTRATIVO", ufficio: null, brandIds: [] },
    { id: "u3", nome: "Debora", email: "amministrazione@gruppopec.com", username: "dgirodo", ruolo: "AMMINISTRATORE", ufficio: "AMMINISTRAZIONE", brandIds: [] },
  ];
  const piano = pianoImportUtenti(PERSONALE_BCONSOLE, esistenti, BRAND);
  assert.equal(piano.length, PERSONALE_BCONSOLE.length);
  const marco = piano.find((a) => a.persona.username === "mpiccatti")!;
  assert.equal(marco.tipo, "COMPLETA");
  if (marco.tipo === "COMPLETA") {
    assert.deepEqual(marco.dati, { username: "mpiccatti", ufficio: "COMMERCIALE" });
    assert.equal(marco.ruoloNelCrm, "AMMINISTRATIVO");
  }
  assert.equal(piano.find((a) => a.persona.username === "dgirodo")!.tipo, "INVARIATO");
  const paolo = piano.find((a) => a.persona.username === "psalvato")!;
  assert.equal(paolo.tipo, "CREA");
  if (paolo.tipo === "CREA") assert.equal(paolo.email, emailSegnaposto("psalvato"));
  // rieseguito dopo aver creato tutti: niente da creare
  const dopo = piano.map((a, i) => ({ id: `n${i}`, nome: a.persona.nome, email: a.tipo === "CREA" ? a.email : `x${i}@x.it`, username: a.persona.username, ruolo: a.persona.ruolo, ufficio: a.persona.ufficio, brandIds: ["b1"] }));
  assert.ok(pianoImportUtenti(PERSONALE_BCONSOLE, dopo, BRAND).every((a) => a.tipo === "INVARIATO"));
});
