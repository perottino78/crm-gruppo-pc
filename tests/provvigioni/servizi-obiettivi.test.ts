import { test } from "node:test";
import assert from "node:assert/strict";
import { importoFuoriProvvigione, baseProvvigione, eServizioDaSpostare, prodottiServizi, SERVIZI_LISTINO, labelServizio } from "../../src/lib/provvigioni/servizi";
import { provvigioneSulleRate, type Contratto } from "../../src/lib/provvigioni/calcoli";
import { avanzamento, estremi, vendutoNelPeriodo, vendutoPerMese, emailSettimanale, settimanaIso, incoraggiamento, nomePeriodo } from "../../src/lib/provvigioni/obiettivi";

const riga = (o: Partial<Parameters<typeof importoFuoriProvvigione>[0][number]> = {}) =>
  ({ quantita: 1, prezzoUnitario: 1000, optionalPrezzo: 0, inProvvigione: true, optionali: [], ...o });

test("servizi: l'ENEA (prodotto senza spunta) si toglie per intero dalla base", () => {
  const fuori = importoFuoriProvvigione([riga({ prezzoUnitario: 5000 }), riga({ prezzoUnitario: 350, inProvvigione: false })]);
  assert.equal(fuori, 350);
  assert.equal(baseProvvigione(4800, fuori), 4450);
});

test("servizi: quantità, optional della riga di servizio e optional senza spunta nelle righe normali", () => {
  const fuori = importoFuoriProvvigione([
    riga({ prezzoUnitario: 70, quantita: 3, inProvvigione: false, optionali: [{ quantita: 1, prezzoUnitario: 10, inProvvigione: true }] }),
    riga({ optionali: [{ quantita: 1, prezzoUnitario: 500, inProvvigione: false }, { quantita: 2, prezzoUnitario: 50, inProvvigione: true }] }),
  ]);
  assert.equal(fuori, 70 * 3 + 10 + 500);
});

test("servizi: righe di testo e prodotti normali vanno in provvigione; base mai sotto zero", () => {
  assert.equal(importoFuoriProvvigione([riga(), riga({ prezzoUnitario: 0 })]), 0);
  assert.equal(baseProvvigione(300, 350), 0);
  assert.equal(baseProvvigione(1000, 0), 1000);
});

test("servizi: optional da spostare e listino di partenza", () => {
  assert.ok(eServizioDaSpostare("Pratica ENEA (gestione e presentazione)"));
  assert.ok(eServizioDaSpostare("Autoscala dal 3° piano in su"));
  assert.ok(eServizioDaSpostare("Facchinaggio al piano"));
  assert.ok(!eServizioDaSpostare("Colore RAL fuori standard"));
  assert.ok(!eServizioDaSpostare("Tenda Serenea"));
  const p = prodottiServizi();
  assert.equal(p.length, SERVIZI_LISTINO.reduce((s, x) => s + x.varianti.length, 0));
  assert.ok(p.every((x) => x.tipologia.startsWith("SERVIZI_") && x.larghezzaMm === 0 && x.prezzoBase > 0));
  assert.equal(p.find((x) => x.tipologia === "SERVIZI_ENEA")!.prezzoBase, 350);
  assert.equal(labelServizio("SERVIZI_AUTOSCALA"), "Autoscala");
});

test("provvigione rata per rata: acconto e saldo maturano quando il cliente paga", () => {
  const c = {
    dovuto: 10000, provvigione: { id: "p", base: 8000, percentuale: 10, importo: 800, controllataIl: new Date(), liquidazioni: [] },
    pagamenti: [
      { id: "a", descrizione: "Acconto", importo: 3000, incassato: 3000, residuo: 0, scadenza: null, ultimoIncasso: null, stato: "PAGATA" },
      { id: "s", descrizione: "Saldo", importo: 7000, incassato: 0, residuo: 7000, scadenza: null, ultimoIncasso: null, stato: "APERTA" },
    ],
  } as unknown as Contratto;
  const r = provvigioneSulleRate(c);
  assert.deepEqual(r.get("a"), { quota: 240, maturata: 240 });
  assert.deepEqual(r.get("s"), { quota: 560, maturata: 0 });
});

test("obiettivi: estremi del mese e dell'anno", () => {
  assert.deepEqual(estremi("2026-02"), { da: "2026-02-01", a: "2026-02-28" });
  assert.deepEqual(estremi("2026-11"), { da: "2026-11-01", a: "2026-11-30" });
  assert.deepEqual(estremi("2026"), { da: "2026-01-01", a: "2026-12-31" });
  assert.equal(nomePeriodo("2026-11"), "novembre 2026");
  assert.equal(nomePeriodo("2026"), "anno 2026");
});

test("obiettivi: venduto nel periodo in ora di Roma", () => {
  const c = [
    { data: new Date("2026-10-31T23:30:00Z"), imponibile: 1000 }, // 1 novembre a Roma
    { data: new Date("2026-11-15T10:00:00Z"), imponibile: 2000 },
    { data: new Date("2026-12-01T10:00:00Z"), imponibile: 5000 },
    { data: null, imponibile: 999 },
  ];
  assert.equal(vendutoNelPeriodo(c, "2026-11"), 3000);
  assert.equal(vendutoNelPeriodo(c, "2026"), 8000);
  const m = vendutoPerMese(c, "2026");
  assert.equal(m.length, 12);
  assert.equal(m[10], 3000);
  assert.equal(m[11], 5000);
});

test("obiettivi: tabella di marcia (in linea, quasi, indietro, raggiunto)", () => {
  // 30 giorni, oggi il 15 → atteso metà
  const a = avanzamento(30000, 15000, "2026-11", "2026-11-15");
  assert.equal(a.giorniTotali, 30);
  assert.equal(a.giorniPassati, 15);
  assert.equal(a.atteso, 15000);
  assert.equal(a.stato, "IN_LINEA");
  assert.equal(a.mancano, 15000);
  assert.equal(a.giorniRimasti, 15);
  assert.equal(a.perSettimana, 15000 / 3);
  assert.equal(avanzamento(30000, 12500, "2026-11", "2026-11-15").stato, "VICINO");
  assert.equal(avanzamento(30000, 5000, "2026-11", "2026-11-15").stato, "INDIETRO");
  assert.equal(avanzamento(30000, 31000, "2026-11", "2026-11-02").stato, "RAGGIUNTO");
  assert.equal(avanzamento(30000, 0, "2026-12", "2026-11-15").stato, "NON_INIZIATO");
  const fine = avanzamento(30000, 29000, "2026-11", "2026-12-10");
  assert.equal(fine.giorniPassati, 30);
  assert.equal(fine.giorniRimasti, 0);
  assert.equal(fine.perSettimana, 1000);
});

test("obiettivi: settimana ISO e incoraggiamenti che cambiano", () => {
  assert.equal(settimanaIso("2026-11-09"), "2026-W46");
  assert.equal(settimanaIso("2026-11-15"), "2026-W46");
  assert.equal(settimanaIso("2027-01-01"), "2026-W53");
  assert.notEqual(incoraggiamento("IN_LINEA", 1), incoraggiamento("IN_LINEA", 2));
});

test("obiettivi: email della settimana", () => {
  const mese = { periodo: "2026-11", premio: 500, av: avanzamento(30000, 5000, "2026-11", "2026-11-16") };
  const anno = { periodo: "2026", premio: null, av: avanzamento(300000, 280000, "2026", "2026-11-16") };
  const m = emailSettimanale({ nome: "Marco Piccatti", oggi: "2026-11-16", mese, anno, link: "https://x/contratti" })!;
  assert.match(m.oggetto, /indietro/);
  assert.match(m.oggetto, /novembre 2026/);
  assert.match(m.testo, /^Ciao Marco,/);
  assert.match(m.testo, /premio 500,00/);
  assert.match(m.testo, /mancano/);
  assert.match(m.testo, /anno 2026/);
  assert.match(m.testo, /https:\/\/x\/contratti/);
  assert.equal(emailSettimanale({ nome: "X", oggi: "2026-11-16", link: "" }), null);
});
