// Esportazione «Prodotti» di BConsole (.xls BIFF8): lettura, colonne riconosciute, categorie su 3 livelli, fornitori.
// Il file bconsole-prodotti.xls ha le stesse colonne dell'export di BConsole ma dati inventati.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { leggiFile } from "../../src/lib/articoli/foglio";
import { leggiXls } from "../../src/lib/articoli/xls";
import { analizzaListino, adattaBConsole, trovaFornitore, testoPercorso } from "../../src/lib/articoli/importa";
import { alberoCategorie } from "../../src/lib/articoli/prezzi";

const file = readFileSync(join(__dirname, "bconsole-prodotti.xls"));

test("legge il .xls: testi (anche con accenti) e numeri", () => {
  const [f] = leggiXls(file);
  assert.equal(f.nome, "Worksheet");
  assert.equal(f.righe.length, 3);
  assert.equal(f.righe[0][5], "Cat. 3 Liv.");
  assert.equal(f.righe[1][2], "ANGOLARE DI PROVA À MISURA");
  assert.equal(f.righe[1][11], "Testo lungo con accenti: perché, città");
  assert.equal(f.righe[1][9], "15");
  assert.equal(f.righe[2][7], "12.5");
  assert.equal(f.righe[2][18], "3.26");
  assert.deepEqual(leggiFile("export_pro_1.xls", file)[0].righe, f.righe);
});

test("colonne di BConsole: Nome = descrizione, Descrizione = testo lungo, Listino e immagine ignorati, prezzi a zero vuoti", () => {
  const t = adattaBConsole(leggiXls(file)[0].righe);
  assert.equal(t[0][2], "DESCRIZIONE");
  assert.equal(t[0][11], "DESCRIZIONE ESTESA");
  assert.equal(t[1][7], ""); // prezzo acquisto 0 = non compilato
  assert.equal(t[2][7], "12.5");
});

test("anteprima: categorie VETRATE › ACCESSORI › …, fornitore a parole invertite o da creare", () => {
  const a = analizzaListino(leggiXls(file)[0].righe, {}, [], [{ id: "f1", ragioneSociale: "MARIO ROSSI", scontoFornitore: null }], []);
  assert.equal(a.errore, undefined);
  assert.deepEqual(a.categorieNuove, ["VETRATE › ACCESSORI › ANGOLARI", "VETRATE › ACCESSORI › PROFILI IN FERRO"]);
  const [ang, prof] = a.righe;
  assert.equal(ang.azione, "NUOVO");
  assert.equal(ang.descrizione, "ANGOLARE DI PROVA À MISURA");
  assert.equal(ang.dati.descrizioneEstesa, "Testo lungo con accenti: perché, città");
  assert.equal(ang.dati.fornitoreId, "f1"); // «Rossi Mario» = «MARIO ROSSI»
  assert.equal(ang.dati.codiceFornitore, "ANG-R1");
  assert.equal(ang.dati.um, "pz");
  assert.equal(ang.dati.prezzoVendita, 15);
  assert.equal(ang.dati.immagineUrl, undefined);
  assert.equal(ang.dati.prezzoListino, undefined); // «LISTINO 2024» non è un prezzo
  assert.equal(prof.dati.um, "m"); // «Mt»
  assert.equal(prof.dati.costoAcquisto, 12.5);
  assert.equal(prof.dati.attivo, false);
  assert.equal(prof.dati.fornitoreNuovo, "Fornitore Nuovo Srl");
  assert.ok(prof.avvisi.some((x) => /verrà creato|viene creato/.test(x)));
  assert.deepEqual(prof.errori, []);
});

test("categorie già esistenti: si riusa il percorso, si crea solo il livello che manca", () => {
  const cat = [
    { id: "v", nome: "Vetrate", padreId: null, metodoPrezzo: "RICARICO", valore: 2, arrotondamento: null, margineMinimo: null },
    { id: "a", nome: "Accessori", padreId: "v", metodoPrezzo: null, valore: null, arrotondamento: null, margineMinimo: null },
    { id: "g", nome: "Angolari", padreId: "a", metodoPrezzo: null, valore: null, arrotondamento: null, margineMinimo: null },
  ];
  const a = analizzaListino(leggiXls(file)[0].righe, {}, [], [], cat);
  assert.equal(a.righe[0].dati.categoriaId, "g");
  assert.equal(a.righe[0].dati.categoriaPercorso, undefined);
  assert.deepEqual(a.righe[1].dati.categoriaPercorso, ["Vetrate", "Accessori", "PROFILI IN FERRO"]);
  assert.equal(testoPercorso(a.righe[1].dati.categoriaPercorso), "Vetrate › Accessori › PROFILI IN FERRO");
  assert.equal(a.righe[1].vendita, 25); // 12,5 × 2: regola della categoria madre
  const albero = alberoCategorie(cat);
  assert.deepEqual(albero.map((c) => [c.livello, c.etichetta]), [[0, "Vetrate"], [1, "Vetrate › Accessori"], [2, "Vetrate › Accessori › Angolari"]]);
});

test("fornitore: parole in qualsiasi ordine, forma societaria ignorata", () => {
  const f = [{ id: "1", ragioneSociale: "CORBELLI SIMONE", scontoFornitore: null }, { id: "2", ragioneSociale: "O.M. Project S.r.l.", scontoFornitore: null }];
  assert.equal(trovaFornitore("SIMONE CORBELLI", f)?.id, "1");
  assert.equal(trovaFornitore("O.M. PROJECT SRL", f)?.id, "2");
  assert.equal(trovaFornitore("Bianchi Luca", f), undefined);
});
