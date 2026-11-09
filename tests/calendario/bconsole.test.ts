import { test } from "node:test";
import assert from "node:assert/strict";
import { convertiEventoBC, incaricatiDa, chiaveNome } from "../../src/lib/calendario/bconsole";

const staff = ["Ugo Perottino", "Roberto Marongiu", "Claudio Trimboli", "Massimo Giordano"];
const base = { id: "33587", start: "2026-11-05T18:00:00+01:00", end: "2026-11-05T19:30:00+01:00", assegnato: "Massimo Giordano", creato_da: "Info P&C", className: "in_corso", telefono: "3331234567", luogo: "Via Roma 1, Asso", origineAna: "FACEBOOK" };

test("appuntamento con il cliente: account, oggetto, stato, tipo, durata, note", () => {
  const a = convertiEventoBC({ ...base, title: "Nasuti Salvatore - CONFERMATO  Preventivo Infissi", descrizione: "chiamare prima<br>citofono rotto&nbsp;" }, staff)!;
  assert.equal(a.account, "Nasuti Salvatore");
  assert.equal(a.oggetto, "CONFERMATO Preventivo Infissi");
  assert.equal(a.stato, "CONFERMATO");
  assert.equal(a.tipo, "COMMERCIALE");
  assert.equal(a.durataMin, 90);
  assert.equal(a.inizio.toISOString(), "2026-11-05T17:00:00.000Z");
  assert.deepEqual(a.incaricati, ["Massimo Giordano"]);
  assert.equal(a.chiave, "BC|33587");
  assert.ok(a.note.startsWith("chiamare prima\ncitofono rotto") && a.note.includes("attività n. 33587, fissato da Info P&C"));
});

test("stati e tipi dal testo", () => {
  assert.equal(convertiEventoBC({ ...base, title: "Rossi Mario - FARE CHIAMATA PERGOTENDA" }, staff)!.tipo, "TELEFONICO");
  assert.equal(convertiEventoBC({ ...base, title: "Rossi Mario - ANNULLATO - Preventivo Vetrate" }, staff)!.stato, "ANNULLATO");
  assert.equal(convertiEventoBC({ ...base, title: "Rossi Mario - Preventivo Vetrate", className: "completata" }, staff)!.stato, "COMPLETATO");
  assert.equal(convertiEventoBC({ ...base, title: "Rossi Mario - Preventivo Vetrate" }, staff)!.stato, "PROGRAMMATO");
});

test("impegni interni a nome di un collega: esclusi", () => {
  assert.equal(convertiEventoBC({ ...base, title: "Roberto Marongiu - OCCUPATO" }, staff), null);
  assert.equal(convertiEventoBC({ ...base, title: "CLAUDIO TRIMBOLI - FESTA DEL PANE" }, staff), null);
  assert.equal(convertiEventoBC({ ...base, title: "MARONGIU ROBERTO - GOMMISTA" }, staff), null);
  assert.equal(convertiEventoBC({ ...base, title: "Rossi Mario - x", start: "non è una data" }, staff), null);
});

test("incaricati: il centralino resta solo se è l'unico", () => {
  assert.deepEqual(incaricatiDa("Info P&C,Ugo Perottino"), ["Ugo Perottino"]);
  assert.deepEqual(incaricatiDa("Ugo Perottino; Paolo Salvato; "), ["Ugo Perottino", "Paolo Salvato"]);
  assert.deepEqual(incaricatiDa("Info P&C"), ["Info P&C"]);
  assert.equal(chiaveNome("Perottino UGO"), chiaveNome("Ugo Perottino"));
});
