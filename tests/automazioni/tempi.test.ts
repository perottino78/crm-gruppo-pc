import { test } from "node:test";
import assert from "node:assert/strict";
import { primaFinestra08, dopoGiorniAlle08, chiusuraGiornata, scadenzaNuovoTentativo, stessaOraFra, troppoInRitardo, dopoMesiAlle10, giorniFa } from "../../src/lib/automazioni/tempi";
import { daOraRoma, perInput } from "../../src/lib/calendario/tempo";

const r = (s: string) => daOraRoma(s)!;
const vedi = (d: Date) => perInput(d);

test("attesa di un giorno lun–sab alle 08:00 (regola Keap)", () => {
  assert.equal(vedi(dopoGiorniAlle08(r("2026-11-06T11:00"), 1)), "2026-11-09T08:00"); // venerdì 11:00 → lunedì 08:00
  assert.equal(vedi(dopoGiorniAlle08(r("2026-11-03T07:30"), 1)), "2026-11-04T08:00"); // martedì 07:30 + 24h = mercoledì 07:30 → mercoledì 08:00
  assert.equal(vedi(dopoGiorniAlle08(r("2026-11-02T06:00"), 1)), "2026-11-03T08:00"); // lunedì 06:00 → martedì 08:00
  assert.equal(vedi(dopoGiorniAlle08(r("2026-11-05T09:00"), 1, false)), "2026-11-09T08:00"); // senza sabato: giovedì → lunedì
  assert.equal(vedi(primaFinestra08(r("2026-11-08T10:00"))), "2026-11-09T08:00"); // domenica → lunedì
});

test("cambio dell'ora legale", () => {
  assert.equal(vedi(dopoGiorniAlle08(r("2026-10-24T09:00"), 1)), "2026-10-26T08:00"); // sabato → lunedì, dopo il cambio d'ora
});

test("i task automatici chiudono alle 18:30", () => {
  assert.equal(vedi(chiusuraGiornata(r("2026-11-03T10:00"))), "2026-11-03T18:30");
  assert.equal(vedi(chiusuraGiornata(r("2026-11-03T18:29"))), "2026-11-03T18:30");
  assert.equal(vedi(chiusuraGiornata(r("2026-11-03T18:30"))), "2026-11-04T18:30");
  assert.equal(vedi(chiusuraGiornata(r("2026-11-03T22:15"))), "2026-11-04T18:30");
});

test("non risponde: nuovo tentativo nel primo giorno utile dopo 24 ore", () => {
  assert.equal(vedi(scadenzaNuovoTentativo(r("2026-11-07T10:00"))), "2026-11-09T18:30"); // sabato → lunedì
  assert.equal(vedi(scadenzaNuovoTentativo(r("2026-11-03T10:00"))), "2026-11-05T18:30"); // martedì 10:00 + 24h → giovedì (08:00 di mercoledì è prima)
});

test("ricontatto: stesso orario R+1, R+2, R+20", () => {
  const R = r("2026-11-05T15:30");
  assert.equal(vedi(stessaOraFra(R, 1)), "2026-11-06T15:30");
  assert.equal(vedi(stessaOraFra(R, 2)), "2026-11-07T15:30");
  assert.equal(vedi(stessaOraFra(R, 20)), "2026-11-25T15:30");
});

test("niente raffiche di email vecchie", () => {
  assert.equal(troppoInRitardo(r("2026-11-03T08:00"), r("2026-11-04T07:59")), false);
  assert.equal(troppoInRitardo(r("2026-11-03T08:00"), r("2026-11-04T08:01")), true);
});

test("recupero dopo N mesi, un giorno feriale alle 10:00", () => {
  assert.equal(vedi(dopoMesiAlle10(r("2026-11-03T15:00"), 3)), "2027-02-03T10:00"); // mercoledì
  assert.equal(vedi(dopoMesiAlle10(r("2026-08-31T09:00"), 3)), "2026-11-30T10:00"); // 31/08 + 3 mesi → 30/11 (lunedì)
  assert.equal(vedi(dopoMesiAlle10(r("2026-11-30T09:00"), 3)), "2027-03-01T10:00"); // 28/02/2027 è domenica → lunedì 1/3
  assert.equal(vedi(dopoMesiAlle10(r("2026-12-15T09:00"), 1)), "2027-01-15T10:00");
});

test("oggi, ieri, N giorni fa", () => {
  assert.equal(giorniFa(r("2026-11-03T23:30"), r("2026-11-03T23:50")), "Oggi");
  assert.equal(giorniFa(r("2026-11-03T23:30"), r("2026-11-04T00:10")), "Ieri");
  assert.equal(giorniFa(r("2026-11-03T10:00"), r("2026-11-06T09:00")), "3 giorni fa");
});
