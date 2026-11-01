import { test } from "node:test";
import assert from "node:assert/strict";
import { somma, primeEAltri, marginiCommesse, marginePer, perMese, anzianita, giorniIncasso, previsioneCassa, bancaDi, simula, type VenditaR } from "../../src/lib/report/calcoli";
import { categoriaFattura, lineaDaTesto, rigaUtile, descrizioneBreve } from "../../src/lib/report/categorie";

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const v = (x: Partial<VenditaR>): VenditaR => ({ data: d("2026-03-10"), imponibile: 1000, venditore: "MGI", progetto: null, categoria: "Vetrate", brand: "P&C", clienteNome: "Rossi", ...x });

test("linea di prodotto dal testo", () => {
  assert.equal(lineaDaTesto("PERGOLA BIOCLIMATICA Rif.prev. n.27/2026;"), "Pergole e bioclimatiche");
  assert.equal(lineaDaTesto("Pergola + vetrate"), "Pergole e bioclimatiche"); // il primo prodotto citato vince sull'ordine
  assert.equal(lineaDaTesto("Vetrate Vepa Rif.prev. n.802/2026;"), "Vetrate");
  assert.equal(lineaDaTesto("Impianto fotovoltaico 6kW + Accumulo"), "Fotovoltaico");
  assert.equal(lineaDaTesto("Kit 6 kw"), "Fotovoltaico");
  assert.equal(lineaDaTesto("Impianto pompa di calore"), "Termico e pompe di calore");
  assert.equal(lineaDaTesto("Depuratore casa"), "Depurazione acqua");
  assert.equal(lineaDaTesto("Serramenti + oscuranti"), "Serramenti e persiane");
  assert.equal(lineaDaTesto("Persiane in alluminio"), "Serramenti e persiane");
  assert.equal(lineaDaTesto("Porta blindata, 1 anta, Classe 3"), "Blindati, cancelli e grate");
  assert.equal(lineaDaTesto("Assistenza Rif.prev. n.839/2026;"), "Posa e servizi");
  assert.equal(lineaDaTesto("Tende a bracci mod. Madrid"), "Tende da sole e schermature");
  assert.equal(lineaDaTesto("Zanzariere plissè laterali"), "Zanzariere");
  assert.equal(lineaDaTesto("Casa"), null);
  // "PDC" nelle pratiche edilizie (permesso di costruire) non è una pompa di calore
  assert.equal(lineaDaTesto("Rif. Pratica: SCIA EDILIZIA ALTERNATIVA AL PDC"), null);
});

test("categoria della fattura: progetto, poi righe, poi marchio", () => {
  assert.equal(categoriaFattura({ progetto: "Vetrate", righe: ["Serramenti in pvc"] }), "Vetrate");
  assert.equal(categoriaFattura({ progetto: "Casa", righe: ["Si dichiara che i lavori non edili...", "Serramenti in pvc, colore Bianco"] }), "Serramenti e persiane");
  assert.equal(categoriaFattura({ righe: ["Acconto per fornitura prodotti acquistati"], marchio: "Solaris" }), "Fotovoltaico");
  assert.equal(categoriaFattura({ righe: ["Acconto per fornitura prodotti acquistati"], marchio: "Pura Fonte" }), "Depurazione acqua");
  assert.equal(categoriaFattura({ righe: ["Corrispettivo per subaffitto immobile"] }), "Altro");
  assert.equal(rigaUtile("Corrispettivo per manodopera ad aliquota agevolata"), null);
  assert.equal(rigaUtile("  Vetrata  Vepa "), "Vetrata Vepa");
  assert.equal(descrizioneBreve(["Totale", "Vetrata Vepa", "Vetrata Vepa", "Zanzariere"]), "Vetrata Vepa · Zanzariere");
  assert.equal(descrizioneBreve(["Totale"]), null);
});

test("somme per chiave con quote e raggruppamento in Altri", () => {
  const s = somma([v({ venditore: "MGI" }), v({ venditore: "UPE", imponibile: 3000 }), v({ venditore: "MGI", imponibile: 500 })], (x) => x.venditore ?? "?", (x) => x.imponibile);
  assert.deepEqual(s.map((x) => [x.chiave, x.valore, x.n]), [["UPE", 3000, 1], ["MGI", 1500, 2]]);
  assert.ok(Math.abs(s[0].quota - 2 / 3) < 1e-9);
  const p = primeEAltri([1, 2, 3, 4, 5].map((i) => ({ chiave: `c${i}`, valore: 10 - i, n: 1, quota: 0.2 })), 2);
  assert.deepEqual(p.map((x) => [x.chiave, x.valore, x.n]), [["c1", 9], ["c2", 8], ["Altri", 18]].map(([a, b]) => [a, b, a === "Altri" ? 3 : 1]));
  assert.equal(primeEAltri(p.slice(0, 3), 2).length, 3); // un solo "resto": non serve raggruppare
});

test("margini delle commesse: costi da BConsole o dalle fatture d'acquisto collegate", () => {
  const vendite = [
    v({ progetto: "1/26", imponibile: 6000, venditore: "MGI" }), v({ progetto: "1/26", imponibile: 4000, venditore: "UPE" }),
    v({ progetto: "2/26", imponibile: 5000, venditore: "UPE", categoria: "Fotovoltaico" }),
    v({ progetto: "3/26", imponibile: 2000 }), // offerta da 10.000: fatturato solo l'acconto
    v({ progetto: "4/26", imponibile: 8000 }), // aperta, costi non ancora arrivati
    v({ progetto: null, imponibile: 999 }),
  ];
  const acquisti = [{ data: d("2026-03-01"), imponibile: 3500, fornitoreNome: "X", progetto: "2/26" }];
  const progetti = [
    { numero: "1/26", clienteNome: "Rossi", descrizione: "Vetrate", categoria: "Vetrate", stato: "Chiuso", totaleOfferto: 10000, costoAttuale: 6000 },
    { numero: "2/26", clienteNome: "Bianchi", descrizione: null, categoria: null, stato: "Chiuso", totaleOfferto: 0, costoAttuale: 0 },
    { numero: "3/26", clienteNome: "Verdi", descrizione: null, categoria: null, stato: "In corso", totaleOfferto: 10000, costoAttuale: 3000 },
    { numero: "4/26", clienteNome: "Neri", descrizione: null, categoria: null, stato: "In corso", totaleOfferto: 8000, costoAttuale: 100 },
  ];
  const m = marginiCommesse(vendite, acquisti, progetti);
  assert.equal(m.length, 4);
  const p1 = m.find((x) => x.numero === "1/26")!;
  assert.deepEqual([p1.ricavo, p1.costo, p1.margine, p1.venditore, p1.categoria, p1.valutabile], [10000, 6000, 4000, "MGI", "Vetrate", true]);
  const p2 = m.find((x) => x.numero === "2/26")!;
  assert.deepEqual([p2.costo, p2.margine, p2.categoria, p2.valutabile], [3500, 1500, "Fotovoltaico", true]);
  assert.equal(m.find((x) => x.numero === "3/26")!.valutabile, false); // fatturato il 20%
  assert.equal(m.find((x) => x.numero === "4/26")!.valutabile, false); // costi non ancora arrivati
  const perVend = marginePer(m, (x) => x.venditore ?? "?");
  assert.deepEqual(perVend.map((g) => [g.chiave, g.ricavo, g.margine, g.n]), [["MGI", 10000, 4000, 1], ["UPE", 5000, 1500, 1]]);
  assert.equal(perVend[0].perc, 0.4);
});

test("vendite e acquisti mese per mese", () => {
  const m = perMese([{ data: d("2026-01-31"), imponibile: 100 }, { data: new Date("2026-02-28T23:30:00Z"), imponibile: 50 }], [{ data: d("2026-02-10"), imponibile: 30 }], d("2026-01-01"), new Date("2026-04-01T00:00:00Z"));
  assert.deepEqual(m.map((x) => [x.etichetta, x.vendite, x.acquisti]), [["gen 26", 100, 0], ["feb 26", 0, 30], ["mar 26", 50, 0]]); // 28/2 23:30 UTC è già marzo a Roma
});

test("anzianità dei crediti e giorni medi di incasso", () => {
  const oggi = d("2026-11-01");
  const a = anzianita([
    { tipo: "INCASSO", residuo: 100, dataScadenza: d("2026-11-20"), controparte: "A" },
    { tipo: "INCASSO", residuo: 200, dataScadenza: d("2026-10-20"), controparte: "B" },
    { tipo: "INCASSO", residuo: 300, dataScadenza: d("2026-06-01"), controparte: "C" },
    { tipo: "INCASSO", residuo: 0, dataScadenza: d("2026-06-01"), controparte: "D" },
  ], oggi);
  assert.deepEqual(a.map((x) => x.importo), [100, 200, 0, 0, 300]);
  assert.equal(giorniIncasso(100000, 365000, 365), 100);
  assert.equal(giorniIncasso(100, 0, 365), null);
});

test("cassa prevista: saldo + incassi − pagamenti, scaduti e ritardi", () => {
  const oggi = d("2026-11-02");
  const sc = [
    { tipo: "INCASSO" as const, residuo: 1000, dataScadenza: d("2026-11-04"), controparte: "A" },
    { tipo: "INCASSO" as const, residuo: 500, dataScadenza: d("2026-09-01"), controparte: "B" }, // scaduto
    { tipo: "PAGAMENTO" as const, residuo: 300, dataScadenza: d("2026-11-10"), controparte: "F" },
    { tipo: "PAGAMENTO" as const, residuo: 200, dataScadenza: d("2026-10-01"), controparte: "G" }, // pagamento scaduto: subito
    { tipo: "PAGAMENTO" as const, residuo: 999, dataScadenza: d("2027-06-01"), controparte: "H" }, // oltre l'orizzonte
  ];
  const c = previsioneCassa(10000, sc, oggi, 4);
  assert.deepEqual(c.map((w) => [w.incassi, w.pagamenti, w.saldo]), [[1000, 200, 10800], [0, 300, 10500], [0, 0, 10500], [0, 0, 10500]]);
  const c2 = previsioneCassa(10000, sc, oggi, 4, { recuperoScaduti: 0.5, ritardoIncassiGiorni: 7 });
  assert.deepEqual(c2.map((w) => [w.incassi, w.pagamenti]), [[0, 200], [1250, 300], [0, 0], [0, 0]]);
});

test("banche riconosciute dal nome del fornitore", () => {
  assert.equal(bancaDi("Banca Bper Spa"), "BPER");
  assert.equal(bancaDi("INTESA SANPAOLO S.P.A."), "Intesa Sanpaolo");
  assert.equal(bancaDi("Banca Intesa Sanpaolo Spa"), "Intesa Sanpaolo");
  assert.equal(bancaDi("Banca Credite Agricole Italia spa"), "Crédit Agricole");
  assert.equal(bancaDi("Intesa Sanpaolo Vita spa - IL MIO DOMANI - Versamenti TFR"), null);
  assert.equal(bancaDi("DIMAR S.P.A."), null);
  assert.equal(bancaDi("Banca di Caraglio"), "Banca di Caraglio");
});

test("simulazione: prezzi, costi, volumi e incassi più veloci", () => {
  const b = { ricavi: 100000, costi: 70000, crediti: 36500, fatturatoIvato: 365000, giorniPeriodo: 365 };
  const zero = simula(b, { prezzi: 0, costi: 0, volumi: 0, giorniIncassoMeno: 0 });
  assert.deepEqual([zero.margine, zero.differenzaMargine, zero.dsoPrima, zero.cassaLiberata], [30000, 0, 37, 0]);
  const s = simula(b, { prezzi: 5, costi: 3, volumi: 10, giorniIncassoMeno: 10 });
  assert.equal(s.ricavi, 115500); // 100.000 × 1,05 × 1,10
  assert.equal(s.costi, 74690); // 70.000 × 0,97 × 1,10
  assert.equal(s.differenzaMargine, 10810);
  assert.deepEqual([s.dsoDopo, s.cassaLiberata], [27, 10000]); // 1.000 €/giorno × 10 giorni
  assert.equal(simula(b, { prezzi: 0, costi: 0, volumi: 0, giorniIncassoMeno: 99 }).dsoDopo, 0); // mai sotto zero
});
