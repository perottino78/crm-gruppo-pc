import { test } from "node:test";
import assert from "node:assert/strict";
import { passiPratica, ordinaPratiche } from "../../src/lib/clienti/pratica";
import { FASI_DEFAULT } from "../../src/lib/flusso";

const fasi = FASI_DEFAULT.map((f) => ({ chiave: f.chiave, nome: f.nome, ufficio: f.ufficio }));
const stati = (r: ReturnType<typeof passiPratica>) => r.passi.map((p) => p.stato[0]).join("");

test("offerta aperta: solo il primo passo è corrente", () => {
  const r = passiPratica({ statoOfferta: "APERTO", commessa: null, fasi });
  assert.equal(r.esito, "TRATTATIVA");
  assert.equal(stati(r), "c" + "f".repeat(r.passi.length - 1));
  assert.equal(r.passi.length, fasi.length + 2);
});

test("offerta scaduta: fermata", () => {
  const r = passiPratica({ statoOfferta: "SCADUTO", commessa: null, fasi });
  assert.equal(r.esito, "PERSA");
  assert.equal(r.passi[0].stato, "stop");
});

test("commessa con task di rilievo aperto: fasi precedenti fatte", () => {
  const r = passiPratica({
    statoOfferta: "ACCETTATO",
    commessa: { stato: "RILIEVO_PROGRAMMATO", tasks: [
      { faseChiave: "ACCETTAZIONE", stato: "COMPLETATO" },
      { faseChiave: "RILIEVO", stato: "IN_CORSO" },
    ] },
    fasi,
  });
  assert.equal(r.esito, "IN_CORSO");
  assert.deepEqual(r.passi.map((p) => p.stato), ["fatto", "fatto", "fatto", "corrente", "futuro", "futuro", "futuro", "futuro"]);
  assert.equal(r.corrente?.chiave, "RILIEVO");
});

test("commessa senza task: fase dedotta dallo stato", () => {
  const r = passiPratica({ statoOfferta: "ACCETTATO", commessa: { stato: "ORDINI", tasks: [] }, fasi });
  assert.equal(r.corrente?.chiave, "ORDINI");
  assert.equal(r.passi.find((p) => p.chiave === "RILIEVO")?.stato, "fatto");
});

test("commessa chiusa: tutto fatto", () => {
  const r = passiPratica({ statoOfferta: "ACCETTATO", commessa: { stato: "CHIUSA", tasks: [] }, fasi });
  assert.equal(r.esito, "CONCLUSA");
  assert.ok(r.passi.every((p) => p.stato === "fatto"));
  assert.equal(r.percentuale, 100);
});

test("commessa annullata: stop sulla fase raggiunta", () => {
  const r = passiPratica({ statoOfferta: "ACCETTATO", commessa: { stato: "ANNULLATA", tasks: [{ faseChiave: "ACCETTAZIONE", stato: "COMPLETATO" }] }, fasi });
  assert.equal(r.esito, "ANNULLATA");
  assert.equal(r.passi.filter((p) => p.stato === "stop").length, 1);
});

test("due pratiche: quella in corso sta sopra, poi trattative, poi storico", () => {
  const l = ordinaPratiche([
    { esito: "CONCLUSA" as const, data: new Date(2026, 9, 1), n: 1 },
    { esito: "TRATTATIVA" as const, data: new Date(2026, 9, 20), n: 2 },
    { esito: "IN_CORSO" as const, data: new Date(2026, 5, 1), n: 3 },
  ]);
  assert.deepEqual(l.map((x) => x.n), [3, 2, 1]);
});

test("task fuori flusso (magazzino) va sull'ultima fase dello stesso ufficio", () => {
  const r = passiPratica({
    statoOfferta: "ACCETTATO",
    commessa: { stato: "ORDINI", tasks: [{ faseChiave: "MATERIALE_COMPLETO", stato: "DA_INIZIARE", ufficio: "FATTURAZIONE" }] },
    fasi,
  });
  assert.equal(r.corrente?.chiave, "FATT_SALDO");
  assert.equal(r.passi.find((p) => p.chiave === "ORDINI")?.stato, "fatto");
});

test("commessa in attesa acconto con soli task annullati: acconto corrente", () => {
  const r = passiPratica({ statoOfferta: "ACCETTATO", commessa: { stato: "IN_ATTESA_ACCONTO", tasks: [{ faseChiave: "MATERIALE_COMPLETO", stato: "ANNULLATO", ufficio: "POSA" }] }, fasi });
  assert.equal(r.corrente?.chiave, "FATT_ACCONTO");
});
