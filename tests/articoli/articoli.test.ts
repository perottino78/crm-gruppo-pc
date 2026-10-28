// Test delle funzioni pure dell'anagrafica articoli: prezzi, fogli Excel/CSV, importazione.
// npx tsx --test tests/articoli/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "../../src/lib/articoli/prezzi";
import { scriviXlsx, leggiFile, leggiCsvTesto, scriviCsv } from "../../src/lib/articoli/foglio";
import { analizzaListino, mappaColonne, contaAnteprima, COLONNE, type Esistente } from "../../src/lib/articoli/importa";

const cat = (id: string, nome: string, padreId: string | null, metodoPrezzo: string | null, valore: number | null, arrotondamento: number | null = null, margineMinimo: number | null = null) =>
  ({ id, nome, padreId, metodoPrezzo, valore, arrotondamento, margineMinimo });
const CATEGORIE = [
  cat("perg", "Pergole", null, "RICARICO", 3.3, null, 30),
  cat("perg-acc", "Accessori pergole", "perg", "RICARICO", 2),
  cat("perg-mot", "Motori", "perg", null, null, 1),
  cat("dep", "Depuratori", null, "MARGINE", 40, 5),
  cat("libera", "Varie", null, null, null),
];

test("numeri scritti all'italiana e all'inglese", () => {
  assert.equal(P.leggiNumero("1.234,50"), 1234.5);
  assert.equal(P.leggiNumero("1,234.50"), 1234.5);
  assert.equal(P.leggiNumero("€ 12,30"), 12.3);
  assert.equal(P.leggiNumero("1.234"), 1234);
  assert.equal(P.leggiNumero("1,234"), 1.234);
  assert.equal(P.leggiNumero("12.5"), 12.5);
  assert.equal(P.leggiNumero("40%"), 40);
  assert.equal(P.leggiNumero(""), null);
  assert.equal(P.leggiNumero("abc"), null);
  assert.equal(P.leggiNumero(7), 7);
});

test("sconti a cascata", () => {
  assert.deepEqual(P.leggiSconti("50+10"), [50, 10]);
  assert.deepEqual(P.leggiSconti("50% + 10%"), [50, 10]);
  assert.deepEqual(P.leggiSconti("50/10/5"), [50, 10, 5]);
  assert.deepEqual(P.leggiSconti(""), []);
  assert.equal(P.leggiSconti("cento"), null);
  assert.equal(P.leggiSconti("120"), null);
  assert.equal(P.fattoreSconti("50+10"), 0.45);
  assert.equal(P.scontoEquivalente("50+10"), 55);
  assert.equal(P.costoNetto({ prezzoListino: 1000, sconti: "50+10" }), 450);
  assert.equal(P.costoNetto({ prezzoListino: null, costoAcquisto: 80 }), 80);
});

test("regola pergole: listino −50% × 3,3 (come da regole aziendali)", () => {
  const c = P.calcolaArticolo({ prezzoListino: 1000, sconti: "50", categoriaId: "perg" }, CATEGORIE);
  assert.equal(c.costo, 500);
  assert.equal(c.vendita, 1650);
  assert.equal(c.coefficiente, 3.3);
  assert.equal(c.regola?.da, "Pergole");
  assert.equal(c.ivato, 2013);
});

test("sottocategoria: regola propria, ereditata dalla madre, arrotondamento ereditato", () => {
  assert.equal(P.calcolaArticolo({ costoAcquisto: 100, categoriaId: "perg-acc" }, CATEGORIE).vendita, 200);
  const mot = P.calcolaArticolo({ costoAcquisto: 101.23, categoriaId: "perg-mot" }, CATEGORIE);
  assert.equal(mot.regola?.da, "Pergole");
  assert.equal(mot.vendita, 335); // 334,06 arrotondato per eccesso all'euro
});

test("margine sul prezzo e arrotondamento a 5 €", () => {
  const c = P.calcolaArticolo({ costoAcquisto: 300, categoriaId: "dep" }, CATEGORIE);
  assert.equal(c.vendita, 500);
  assert.equal(c.margine, 40);
  const d = P.calcolaArticolo({ costoAcquisto: 301, categoriaId: "dep" }, CATEGORIE);
  assert.equal(d.vendita, 505); // 501,67 → 505
});

test("regola dell'articolo prevale e prezzo a mano", () => {
  assert.equal(P.calcolaArticolo({ costoAcquisto: 100, categoriaId: "perg", metodoPrezzo: "MARGINE", valorePrezzo: 50 }, CATEGORIE).vendita, 200);
  const man = P.calcolaArticolo({ costoAcquisto: 100, categoriaId: "perg", metodoPrezzo: "MANUALE", prezzoVendita: 250 }, CATEGORIE);
  assert.equal(man.vendita, 250);
  assert.equal(man.margine, 60);
  const senza = P.calcolaArticolo({ costoAcquisto: 100, categoriaId: "libera", prezzoVendita: 130 }, CATEGORIE);
  assert.equal(senza.vendita, 130);
  assert.equal(senza.regola, null);
});

test("margine sotto il minimo della categoria", () => {
  const c = P.calcolaArticolo({ costoAcquisto: 100, categoriaId: "perg", metodoPrezzo: "MANUALE", prezzoVendita: 120 }, CATEGORIE);
  assert.equal(c.sottoMinimo, true);
  assert.equal(P.testoRegola({ metodo: "RICARICO", valore: 3.3 }), "×3,3");
  assert.equal(P.testoRegola({ metodoPrezzo: "MARGINE", valore: 40 }), "margine 40%");
});

test("Excel: scrivo e rileggo lo stesso file (accenti, numeri, celle vuote)", () => {
  const buf = scriviXlsx([
    { nome: "Articoli", righe: [["CODICE", "DESCRIZIONE", "PREZZO LISTINO", "NOTE"], ["A1", "Motore tubolare «Somfy» àèìòù & <test>", 1234.5, null], ["A2", "Telecomando", 0.1 + 0.2, "ok"]], numeriDecimali: [2] },
    { nome: "Istruzioni", righe: [["Testo"]] },
  ]);
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  const fogli = leggiFile("prova.xlsx", buf);
  assert.equal(fogli.length, 2);
  assert.equal(fogli[0].nome, "Articoli");
  assert.deepEqual(fogli[0].righe[1], ["A1", "Motore tubolare «Somfy» àèìòù & <test>", "1234,5"]);
  assert.deepEqual(fogli[0].righe[2], ["A2", "Telecomando", "0,3", "ok"]);
  assert.equal(P.leggiNumero(fogli[0].righe[1][2]), 1234.5);
});

test("CSV: separatore riconosciuto, virgolette, a capo nel campo", () => {
  const t = leggiCsvTesto('CODICE;DESCRIZIONE;PREZZO\r\nA1;"Vite; 6x40 ""inox""";1,20\r\nA2;"riga\ndoppia";3\r\n');
  assert.deepEqual(t[1], ["A1", 'Vite; 6x40 "inox"', "1,20"]);
  assert.deepEqual(t[2], ["A2", "riga\ndoppia", "3"]);
  const out = scriviCsv([["A", "x;y", 1.5]]);
  assert.equal(out, '\uFEFFA;"x;y";1,5\r\n');
  assert.throws(() => leggiFile("vecchio.xls", Buffer.from("D0CF11E0", "hex")), /\.xls/);
});

test("Riconosce le colonne del modello e i sinonimi dei listini fornitore", () => {
  const m = mappaColonne([["Listino 2026 ACME"], [], ["Cod.", "Descrizione", "Prezzo", "Sconto %", "Prezzo vendita", "Margine effettivo %"]]);
  assert.ok(m);
  assert.equal(m!.riga, 2);
  assert.equal(m!.mappa.codice, 0);
  assert.equal(m!.mappa.prezzoListino, 2);
  assert.equal(m!.mappa.sconti, 3);
  assert.equal(m!.mappa.prezzoVendita, 4);
  assert.deepEqual(m!.ignorate, ["Margine effettivo %"]);
  const mod = mappaColonne([COLONNE.map((c) => c.titolo)]);
  assert.equal(Object.keys(mod!.mappa).length, COLONNE.length);
});

const FORN = [{ id: "f1", ragioneSociale: "ACME S.R.L.", scontoFornitore: 40 }, { id: "f2", ragioneSociale: "Somfy Italia", scontoFornitore: null }];
const base = (x: Partial<Esistente>): Esistente => ({ id: "e1", codice: "MOT-01", codiceFornitore: "S100", fornitoreId: "f2", descrizione: "Motore", descrizioneEstesa: null, categoriaId: "perg-mot", marca: null, divisione: "P&C", um: "pz", aliquotaIva: 22, prezzoListino: 200, sconti: "50", costoAcquisto: null, metodoPrezzo: null, valorePrezzo: null, prezzoVendita: 330, ean: null, immagineUrl: null, note: null, attivo: true, ...x });

test("Anteprima: nuovo, modificato, invariato, errori, doppioni, categorie nuove", () => {
  const tab = [
    ["CODICE", "CODICE FORNITORE", "DESCRIZIONE", "CATEGORIA", "SOTTOCATEGORIA", "FORNITORE", "PREZZO LISTINO", "SCONTI", "PREZZO VENDITA"],
    ["", "S100", "Motore", "Pergole", "Motori", "Somfy Italia", "220", "50", ""],
    ["MOT-01", "", "", "", "", "", "220", "", ""],
    ["", "X9", "Staffa nuova", "Pergole", "Staffe", "", "10", "", ""],
    ["", "Z1", "", "", "", "", "5", "", ""],
    ["", "Y1", "Telo", "Varie", "", "Acme srl", "100", "", "150"],
    ["", "W1", "Prezzo strano", "", "", "", "abc", "", ""],
    ["", "", "", "", "", "", "", "", ""],
  ];
  const a = analizzaListino(tab, { fornitoreId: "f1", divisione: "P&C" }, [base({})], FORN, CATEGORIE);
  assert.equal(a.errore, undefined);
  const [mod, dop, nuovo, senzaDescr, telo, strano] = a.righe;
  assert.equal(mod.azione, "MODIFICA");
  assert.equal(mod.articoloId, "e1");
  assert.ok(mod.modifiche.some((x) => x.campo === "Listino" && x.prima === "200" && x.dopo === "220"));
  assert.equal(mod.vendita, 363); // 220 × 50% × 3,3 = 363, arrotondato all'euro
  assert.equal(dop.azione, "ERRORE");
  assert.match(dop.errori[0], /doppia/);
  assert.equal(nuovo.azione, "NUOVO");
  assert.equal(nuovo.dati.fornitoreId, "f1");
  assert.equal(nuovo.dati.sconti, "40");
  assert.equal(nuovo.dati.sottocategoriaNome, "Staffe");
  assert.deepEqual(a.categorieNuove, ["Pergole › Staffe"]);
  assert.equal(senzaDescr.azione, "ERRORE");
  assert.equal(telo.azione, "NUOVO");
  assert.equal(telo.dati.fornitoreId, "f1"); // "Acme srl" riconosciuto come "ACME S.R.L."
  assert.equal(telo.dati.metodoPrezzo, "MANUALE");
  assert.equal(telo.vendita, 150);
  assert.equal(strano.azione, "ERRORE");
  assert.match(strano.errori.join(), /non è un numero/);
  const n = contaAnteprima(a.righe);
  assert.deepEqual([n.nuovi, n.modificati, n.errori], [2, 1, 3]);
});

test("Anteprima: riga identica è invariata, prezzo diverso dalla regola segnalato, solo aggiornamento", () => {
  const tab = [["CODICE", "DESCRIZIONE", "PREZZO LISTINO", "SCONTI", "PREZZO VENDITA"], ["MOT-01", "Motore", "200", "50", "999"], ["NUOVO-1", "Nuovo", "10", "", ""]];
  const a = analizzaListino(tab, { soloAggiornamento: true }, [base({})], FORN, CATEGORIE);
  assert.equal(a.righe[0].azione, "INVARIATO");
  assert.match(a.righe[0].avvisi.join(), /tengo il calcolato/);
  assert.equal(a.righe[1].azione, "SALTATA");
});

test("Anteprima: ricarico in percentuale e margine, variazione forte del costo", () => {
  const tab = [["CODICE", "DESCRIZIONE", "COSTO NETTO", "RICARICO", "MARGINE %"], ["MOT-01", "Motore", "200", "30%", ""], ["B", "Filtro", "60", "", "40"]];
  const a = analizzaListino(tab, {}, [base({})], FORN, CATEGORIE);
  assert.equal(a.righe[0].dati.metodoPrezzo, "RICARICO");
  assert.equal(a.righe[0].dati.valorePrezzo, 1.3);
  assert.equal(a.righe[0].dati.prezzoListino, null);
  assert.match(a.righe[0].avvisi.join(), /costo cambia del 100%/);
  assert.equal(a.righe[1].vendita, 100);
});
