import { test } from "node:test";
import assert from "node:assert/strict";
import { passiPratica, passoDaMostrare, passoPrecedente, type DatiPassi } from "../../src/lib/pratica/passi";

const base: DatiPassi = { fatturaAccontoIl: null, progettoCreatoIl: null, benvenutoIl: null, viaLibera: false, rilievoFissato: false, rilievoCaricato: false, ordinato: false, materialeCompleto: false, saldoIncassato: false, posaFissata: false, posaFinita: false, kitConsegnato: false };
const adesso = new Date();
const stato = (d: DatiPassi) => Object.fromEntries(passiPratica(d).passi.map((p) => [p.chiave, p.stato[0]]));

test("pratica nuova: il primo passo è la fattura di acconto, gli altri aspettano", () => {
  const r = passiPratica(base);
  assert.equal(r.corrente, "FATTURA");
  assert.equal(stato(base).FATTURA, "O");
  assert.equal(stato(base).PROGETTO, "I");
  assert.equal(stato(base).RILIEVO_APP, "I");
});

test("fattura fatta → progetto → benvenuto, in ordine", () => {
  const a = { ...base, fatturaAccontoIl: adesso };
  assert.equal(passiPratica(a).corrente, "PROGETTO");
  const b = { ...a, progettoCreatoIl: adesso };
  assert.equal(passiPratica(b).corrente, "BENVENUTO");
  const c = { ...b, benvenutoIl: adesso };
  assert.equal(passiPratica(c).corrente, "RILIEVO_APP");
});

test("l'incasso è in parallelo: non cambia il passo corrente ma sblocca il rilievo", () => {
  const d = { ...base, fatturaAccontoIl: adesso, progettoCreatoIl: adesso, benvenutoIl: adesso };
  assert.match(passiPratica(d).passi.find((p) => p.chiave === "RILIEVO_APP")!.nota, /acconto incassato/);
  const e = { ...d, viaLibera: true };
  assert.equal(passiPratica(e).corrente, "RILIEVO_APP");
  assert.equal(stato(e).INCASSO, "F");
  assert.match(passiPratica(e).passi.find((p) => p.chiave === "RILIEVO_APP")!.nota, /rilevatore/);
});

test("pratica già avviata: i passi che non ha mai avuto risultano fatti", () => {
  const v = { ...base, rilievoFissato: true };
  const s = stato(v);
  assert.equal(s.FATTURA, "F"); assert.equal(s.PROGETTO, "F"); assert.equal(s.BENVENUTO, "F");
  assert.equal(passiPratica(v).corrente, "RILIEVO");
});

test("materiale, arrivo, posa e kit in sequenza fino alla fine", () => {
  const t = { ...base, fatturaAccontoIl: adesso, progettoCreatoIl: adesso, benvenutoIl: adesso, viaLibera: true, rilievoFissato: true, rilievoCaricato: true };
  assert.equal(passiPratica(t).corrente, "MATERIALE");
  assert.equal(passiPratica({ ...t, ordinato: true }).corrente, "ARRIVO");
  assert.equal(passiPratica({ ...t, ordinato: true, materialeCompleto: true }).corrente, "POSA_APP");
  assert.equal(passiPratica({ ...t, ordinato: true, materialeCompleto: true, posaFissata: true }).corrente, "POSA");
  assert.equal(passiPratica({ ...t, ordinato: true, materialeCompleto: true, posaFissata: true, posaFinita: true }).corrente, "KIT");
  assert.equal(passiPratica({ ...t, ordinato: true, materialeCompleto: true, posaFissata: true, posaFinita: true, kitConsegnato: true }).corrente, null);
});

test("passo da mostrare: solo il corrente, un passo fatto per rivederlo, mai uno futuro", () => {
  const { passi, corrente } = passiPratica({ ...base, fatturaAccontoIl: adesso });
  assert.equal(passoDaMostrare(passi, corrente, null), "PROGETTO");
  assert.equal(passoDaMostrare(passi, corrente, "FATTURA"), "FATTURA");
  assert.equal(passoDaMostrare(passi, corrente, "RILIEVO"), "PROGETTO", "un passo futuro non si apre");
  assert.equal(passoDaMostrare(passi, corrente, "INCASSO"), "INCASSO", "l'incasso è sempre apribile");
});

test("passo precedente: salta i passi in parallelo", () => {
  const { passi } = passiPratica(base);
  assert.equal(passoPrecedente(passi, "RILIEVO_APP")?.chiave, "BENVENUTO");
  assert.equal(passoPrecedente(passi, "POSA_APP")?.chiave, "ARRIVO");
  assert.equal(passoPrecedente(passi, "FATTURA"), null);
});

import { passiPratica as passiScheda } from "../../src/lib/clienti/pratica";
test("scheda cliente: acconto incassato → «Incasso acconto» è fatto anche se la fattura di Giorgia è ancora da fare", () => {
  const fasi = [
    { chiave: "FATT_ACCONTO", nome: "Fattura acconto", ufficio: "FATTURAZIONE" },
    { chiave: "PROGETTO", nome: "Incasso acconto", ufficio: "AMMINISTRAZIONE" },
    { chiave: "RILIEVO", nome: "Rilievo", ufficio: "TECNICO" },
  ];
  const r = passiScheda({ statoOfferta: "ACCETTATO", fasi, commessa: { stato: "IN_ATTESA_ACCONTO", accontoIncassato: true, tasks: [{ faseChiave: "FATT_ACCONTO", stato: "DA_FARE", ufficio: "FATTURAZIONE" }] } });
  const st = Object.fromEntries(r.passi.map((p) => [p.chiave, p.stato]));
  assert.equal(st.FATT_ACCONTO, "corrente");
  assert.equal(st.PROGETTO, "fatto");
  assert.equal(st.RILIEVO, "futuro");
});
