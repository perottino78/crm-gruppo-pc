import { test } from "node:test";
import assert from "node:assert/strict";
import { passiPratica, passoDaMostrare, passoPrecedente, type DatiPassi } from "../../src/lib/pratica/passi";

const base: DatiPassi = { fatturaAccontoIl: null, progettoCreatoIl: null, benvenutoIl: null, viaLibera: false, rilievoFissato: false, rilievoCaricato: false, ordinato: false, materialeCompleto: false, saldoIncassato: false, posaFissata: false, posaFinita: false, kitConsegnato: false };
const adesso = new Date();
const stato = (d: DatiPassi) => Object.fromEntries(passiPratica(d).passi.map((p) => [p.chiave, p.stato[0]]));

test("pratica nuova: il primo passo è la creazione del progetto, gli altri aspettano", () => {
  const r = passiPratica(base);
  assert.equal(r.corrente, "PROGETTO");
  assert.equal(stato(base).PROGETTO, "O");
  assert.equal(stato(base).FATTURA, "I");
  assert.equal(stato(base).RILIEVO_APP, "I");
});

test("progetto → benvenuto → fattura, in ordine", () => {
  const a = { ...base, progettoCreatoIl: adesso };
  assert.equal(passiPratica(a).corrente, "BENVENUTO");
  const b = { ...a, benvenutoIl: adesso };
  assert.equal(passiPratica(b).corrente, "FATTURA");
  const c = { ...b, fatturaAccontoIl: adesso };
  assert.equal(passiPratica(c).corrente, "RILIEVO_APP");
});

test("l'incasso è in parallelo: non cambia il passo corrente ma sblocca il rilievo", () => {
  const d = { ...base, fatturaAccontoIl: adesso, progettoCreatoIl: adesso, benvenutoIl: adesso };
  assert.match(passiPratica(d).passi.find((p) => p.chiave === "RILIEVO_APP")!.nota, /50% incassato/);
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
  const { passi, corrente } = passiPratica({ ...base, progettoCreatoIl: adesso });
  assert.equal(passoDaMostrare(passi, corrente, null), "BENVENUTO");
  assert.equal(passoDaMostrare(passi, corrente, "PROGETTO"), "PROGETTO");
  assert.equal(passoDaMostrare(passi, corrente, "RILIEVO"), "BENVENUTO", "un passo futuro non si apre");
  assert.equal(passoDaMostrare(passi, corrente, "SALDO"), "SALDO", "anche il saldo è sempre apribile");
  assert.equal(passoDaMostrare(passi, corrente, "INCASSO"), "INCASSO", "l'incasso è sempre apribile");
});

test("passo precedente: salta i passi in parallelo", () => {
  const { passi } = passiPratica(base);
  assert.equal(passoPrecedente(passi, "RILIEVO_APP")?.chiave, "FATTURA");
  assert.equal(passoPrecedente(passi, "POSA_APP")?.chiave, "ARRIVO");
  assert.equal(passoPrecedente(passi, "PROGETTO"), null);
  assert.equal(passoPrecedente(passi, "BENVENUTO")?.chiave, "PROGETTO");
  assert.equal(passoPrecedente(passi, "FATTURA")?.chiave, "BENVENUTO");
});

test("il saldo si può aprire quando vuoi ma si evidenzia solo a materiale arrivato", () => {
  assert.equal(stato(base).SALDO, "I");
  assert.equal(passiPratica(base).passi.find((p) => p.chiave === "SALDO")!.parallelo, true);
  assert.equal(stato({ ...base, fatturaAccontoIl: adesso, progettoCreatoIl: adesso, benvenutoIl: adesso, viaLibera: true, rilievoFissato: true, rilievoCaricato: true, ordinato: true, materialeCompleto: true }).SALDO, "O");
  assert.equal(stato({ ...base, saldoIncassato: true }).SALDO, "F");
});

test("posa parziale per materiale: si torna a materiale e ordini, poi arrivo, poi nuova posa", () => {
  const fino = { ...base, fatturaAccontoIl: adesso, progettoCreatoIl: adesso, benvenutoIl: adesso, viaLibera: true, rilievoFissato: true, rilievoCaricato: true, ordinato: true, saldoIncassato: true };
  // posa parziale: materiale non più completo, nessuna posa aperta
  const r1 = { ...fino, materialeCompleto: false, posaFissata: false, posaFinita: false, riordino: { ordinato: false } };
  assert.equal(passiPratica(r1).corrente, "MATERIALE");
  assert.match(passiPratica(r1).passi.find((p) => p.chiave === "MATERIALE")!.nota, /Posa parziale/);
  assert.equal(passiPratica({ ...r1, riordino: { ordinato: true } }).corrente, "ARRIVO");
  // materiale arrivato: il riordino si chiude e si torna a fissare la posa
  assert.equal(passiPratica({ ...fino, materialeCompleto: true, posaFissata: false, riordino: null }).corrente, "POSA_APP");
});

test("intervento di fine posa aperto: la pratica resta a «Posa e fine lavori»; con riordino prima materiale e arrivo", () => {
  const fino = { ...base, fatturaAccontoIl: adesso, progettoCreatoIl: adesso, benvenutoIl: adesso, viaLibera: true, rilievoFissato: true, rilievoCaricato: true, ordinato: true, materialeCompleto: true, saldoIncassato: true };
  const r = passiPratica({ ...fino, interventoFinePosa: true });
  assert.equal(r.corrente, "POSA");
  assert.match(r.passi.find((p) => p.chiave === "POSA")!.nota, /intervento di fine posa/);
  assert.equal(passiPratica({ ...fino, materialeCompleto: false, interventoFinePosa: true, riordino: { ordinato: false } }).corrente, "MATERIALE");
  assert.equal(passiPratica({ ...fino, interventoFinePosa: true, posaFinita: true }).corrente, "KIT");
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

test("pratica presa da BConsole: progetto, fattura e benvenuto sono già fatti e «Carica il rilievo» si apre", () => {
  const r = passiPratica({ ...base, daBConsole: true });
  assert.equal(r.corrente, "RILIEVO_APP");
  const st = Object.fromEntries(r.passi.map((p) => [p.chiave, p.stato]));
  assert.equal(st.PROGETTO, "FATTO");
  assert.equal(st.FATTURA, "FATTO");
  // dal task del rilievo si arriva al caricamento anche se l'appuntamento non è in ONE (rifissato su BConsole)
  assert.equal(passoDaMostrare(r.passi, r.corrente, "RILIEVO"), "RILIEVO");
});

test("«Arrivo in magazzino» si può aprire anche mentre il passo corrente è ancora materiale e ordini", () => {
  const r = passiPratica({ ...base, fatturaAccontoIl: new Date(), progettoCreatoIl: new Date(), benvenutoIl: new Date(), viaLibera: true, rilievoFissato: true, rilievoCaricato: true });
  assert.equal(r.corrente, "MATERIALE");
  assert.equal(passoDaMostrare(r.passi, r.corrente, "ARRIVO"), "ARRIVO");
  assert.equal(passoDaMostrare(r.passi, r.corrente, "POSA"), "MATERIALE");
});

test("l'incasso si evidenzia solo dopo la fattura di acconto ma resta sempre apribile (Debora 26/11/2026)", () => {
  const { passi, corrente } = passiPratica(base);
  assert.equal(stato(base).INCASSO, "I", "pratica appena nata: l'incasso non è evidenziato");
  assert.equal(stato({ ...base, progettoCreatoIl: adesso, benvenutoIl: adesso }).INCASSO, "I", "senza fattura di acconto ancora no");
  assert.equal(stato({ ...base, progettoCreatoIl: adesso, benvenutoIl: adesso, fatturaAccontoIl: adesso }).INCASSO, "O", "con la fattura è il suo turno");
  assert.equal(stato({ ...base, progettoCreatoIl: adesso, benvenutoIl: adesso, fatturaAccontoIl: adesso, viaLibera: true }).INCASSO, "F");
  assert.equal(passoDaMostrare(passi, corrente, "INCASSO"), "INCASSO", "apribile anche quando non è il suo turno");
  assert.equal(passoDaMostrare(passi, corrente, "SALDO"), "SALDO");
});
