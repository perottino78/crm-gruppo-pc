import { test } from "node:test";
import assert from "node:assert/strict";
import { whereCampagna, personalizza, giorniAllaScadenza, leggiGiorniPromemoria, promemoriaDiOggi, testoGiorni, emailValida, SENZA_STATO } from "../../src/lib/campagne/regole";
import { daOraRoma } from "../../src/lib/calendario/tempo";

const r = (s: string) => daOraRoma(s)!;

test("filtri: marchio, stato (anche 'senza stato'), tipo, provenienza, commerciale, provincia", () => {
  assert.deepEqual(whereCampagna({ marchi: [], stati: [], categorie: [] }), { AND: [] });
  const w = whereCampagna({ marchi: ["Solaris", "P&C"], stati: ["COMPRATO", SENZA_STATO], categorie: ["Cliente"], provenienza: "FACEBOOK", commercialeId: "u1", provincia: " to " });
  assert.deepEqual(w.AND, [
    { brand: { nome: { in: ["Solaris", "P&C"] } } },
    { OR: [{ statoLead: { in: ["COMPRATO"] } }, { statoLead: null }, { statoLead: "" }] },
    { OR: [{ categoria: { contains: "Cliente", mode: "insensitive" } }] },
    { origine: "FACEBOOK" },
    { responsabileId: "u1" },
    { provincia: { contains: "to", mode: "insensitive" } },
  ]);
});

test("{nome}: nome proprio se c'è, altrimenti il nome dell'anagrafica sistemato", () => {
  assert.equal(personalizza("Ciao {nome},", "ROSSI MARIO", "mario"), "Ciao Mario,");
  assert.equal(personalizza("Ciao {nome},", "ROSSI MARIO"), "Ciao Rossi Mario,");
  assert.equal(personalizza("Ciao { Nome }!", "D'angelo  anna"), "Ciao D'angelo anna!"); // maiuscole miste: lasciato com'è
  assert.equal(personalizza("Ciao {nome}", "  "), "Ciao cliente");
});

test("giorni alla scadenza contati sul calendario di Roma", () => {
  assert.equal(giorniAllaScadenza(r("2026-11-10T12:00"), r("2026-11-07T23:30")), 3);
  assert.equal(giorniAllaScadenza(r("2026-11-10T12:00"), r("2026-11-10T00:10")), 0);
  assert.equal(giorniAllaScadenza(r("2026-11-10T12:00"), r("2026-11-11T08:00")), -1);
  assert.equal(giorniAllaScadenza(r("2026-03-30T12:00"), r("2026-03-28T08:00")), 2); // cambio dell'ora legale
});

test("giorni degli avvisi da Impostazioni", () => {
  assert.deepEqual(leggiGiorniPromemoria(null), [3, 2, 1]);
  assert.deepEqual(leggiGiorniPromemoria("1, 3;7 3 x -2 99"), [7, 3, 1]);
  assert.deepEqual(leggiGiorniPromemoria("0"), [0]);
});

test("avviso di oggi: solo nei giorni scelti e una volta sola", () => {
  const fino = r("2026-11-10T12:00");
  assert.equal(promemoriaDiOggi(fino, [3, 2, 1], [], r("2026-11-07T08:00")), 3);
  assert.equal(promemoriaDiOggi(fino, [3, 2, 1], ["3"], r("2026-11-07T18:00")), null);
  assert.equal(promemoriaDiOggi(fino, [3, 2, 1], ["3"], r("2026-11-08T08:00")), 2);
  assert.equal(promemoriaDiOggi(fino, [3, 2, 1], [], r("2026-11-05T08:00")), null);
  assert.equal(promemoriaDiOggi(null, [3, 2, 1], [], r("2026-11-07T08:00")), null);
  assert.equal(testoGiorni(0), "oggi");
  assert.equal(testoGiorni(1), "domani");
  assert.equal(testoGiorni(3), "fra 3 giorni");
});

test("email valide", () => {
  assert.ok(emailValida(" mario@rossi.it "));
  assert.ok(!emailValida("mario@rossi"));
  assert.ok(!emailValida("senza-email@importato.invalid"));
  assert.ok(!emailValida(null));
});
