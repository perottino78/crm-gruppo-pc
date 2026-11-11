import { test } from "node:test";
import assert from "node:assert/strict";
import {
  incassatoScadenza, riepilogoPagamenti, riepilogoProvvigione, importoProvvigione, contrattiDaFatture, sigleDi,
  corrisponde, filtra, totali, type Contratto, type FatturaC, type ProgettoC,
} from "../../src/lib/provvigioni/calcoli";

const pag = (importo: number, residuo: number, stato = "APERTA", ultimo: Date | null = null) =>
  ({ id: Math.random().toString(36), descrizione: "Rata", importo, incassato: incassatoScadenza({ importo, residuo, stato }), residuo, scadenza: null, ultimoIncasso: ultimo, stato });

const contratto = (o: Partial<Contratto> = {}): Contratto => ({
  chiave: "C:1", origine: "CRM", numero: "C2026-001", data: new Date("2026-05-10"), clienteNome: "Rossi Mario", comune: "Rivoli",
  marchio: "P&C", descrizione: "Infissi in PVC", stato: "IN_CORSO", commercialeId: "u1", commercialeNome: "Marco Piccatti",
  imponibile: 10000, dovuto: 12200, fatture: [], pagamenti: [], provvigione: null, ...o,
});

test("incassato di una scadenza: annullate e sostituite non contano", () => {
  assert.equal(incassatoScadenza({ importo: 1000, residuo: 400, stato: "PARZIALE" }), 600);
  assert.equal(incassatoScadenza({ importo: 1000, residuo: 0, stato: "ANNULLATA" }), 0);
  assert.equal(incassatoScadenza({ importo: 1000, residuo: -5, stato: "PAGATA" }), 1000);
});

test("pagamenti del cliente: da incassare, in parte, pagato", () => {
  assert.equal(riepilogoPagamenti(contratto()).stato, "DA_INCASSARE");
  const parte = riepilogoPagamenti(contratto({ pagamenti: [pag(6100, 0, "PAGATA", new Date("2026-06-01")), pag(6100, 6100)] }));
  assert.equal(parte.stato, "PARZIALE");
  assert.equal(parte.incassato, 6100);
  assert.equal(parte.residuo, 6100);
  assert.equal(parte.quota, 0.5);
  assert.deepEqual(parte.ultimoIncasso, new Date("2026-06-01"));
  assert.equal(riepilogoPagamenti(contratto({ pagamenti: [pag(6100, 0, "PAGATA"), pag(6100, 0, "PAGATA")] })).stato, "PAGATO");
  assert.equal(riepilogoPagamenti(contratto({ dovuto: 0 })).stato, "SENZA_IMPORTI");
});

test("provvigione: da controllare finché la fatturazione non la inserisce", () => {
  const r = riepilogoProvvigione(contratto());
  assert.equal(r.stato, "DA_CONTROLLARE");
  assert.equal(r.importo, 0);
});

test("provvigione matura con i pagamenti e si liquida anche in più volte", () => {
  assert.equal(importoProvvigione(10000, 8), 800);
  const prov = { id: "p", base: 10000, percentuale: 8, importo: 800, controllataIl: new Date(), liquidazioni: [] as { id: string; importo: number; data: Date }[] };
  const c = contratto({ provvigione: prov, pagamenti: [pag(6100, 0, "PAGATA"), pag(6100, 6100)] });
  let r = riepilogoProvvigione(c);
  assert.deepEqual([r.stato, r.maturata, r.daLiquidare, r.futura], ["DA_LIQUIDARE", 400, 400, 400]);
  prov.liquidazioni.push({ id: "l1", importo: 400, data: new Date() });
  r = riepilogoProvvigione(c);
  assert.deepEqual([r.stato, r.liquidata, r.daLiquidare], ["IN_MATURAZIONE", 400, 0]);
  c.pagamenti = [pag(6100, 0, "PAGATA"), pag(6100, 0, "PAGATA")];
  r = riepilogoProvvigione(c);
  assert.deepEqual([r.stato, r.daLiquidare], ["DA_LIQUIDARE", 400]);
  prov.liquidazioni.push({ id: "l2", importo: 400, data: new Date() });
  assert.equal(riepilogoProvvigione(c).stato, "LIQUIDATA");
});

test("contratti BConsole: fatture raggruppate per progetto, note di credito tolgono", () => {
  const f = (o: Partial<FatturaC>): FatturaC => ({ id: Math.random().toString(36), numero: "1", data: new Date("2026-03-01"), clienteNome: "BIANCHI LUCA", imponibile: 1000, totale: 1220, tipoDocumento: "TD01", venditore: "MPI", progetto: null, brand: "P&C", descrizione: null, commessaId: null, ...o });
  const progetti = new Map<string, ProgettoC>([["758/26", { numero: "758/26", clienteNome: "Bianchi Luca", descrizione: "Pergola bioclimatica", tipologia: "P&C", stato: "In corso", totaleOfferto: 5000, creatoIl: new Date("2026-02-15") }]]);
  const out = contrattiDaFatture([
    f({ numero: "10", progetto: "758/26" }),
    f({ numero: "11", progetto: "758/26", data: new Date("2026-04-01") }),
    f({ numero: "12", progetto: "758/26", tipoDocumento: "TD04", imponibile: 100, totale: 122 }),
    f({ numero: "20" }),
    f({ numero: "30", commessaId: "c1" }),
  ], progetti);
  assert.equal(out.length, 2);
  const pr = out.find((c) => c.chiave === "BC:758/26")!;
  assert.deepEqual([pr.clienteNome, pr.descrizione, pr.dovuto, pr.imponibile, pr.fatture.length, pr.venditore], ["Bianchi Luca", "Pergola bioclimatica", 2318, 5000, 3, "MPI"]);
  assert.equal(out.find((c) => c.chiave.startsWith("FV:"))!.numero, "Fatt. 20");
});

test("sigle BConsole dell'utente", () => {
  const sigle = { MPI: "mpiccatti", UPE: "uperottino" }, nomi = { mpiccatti: "Marco Piccatti", uperottino: "Ugo Perottino" };
  assert.deepEqual(sigleDi({ username: "mpiccatti", nome: "Marco" }, sigle, nomi), ["MPI"]);
  assert.deepEqual(sigleDi({ username: "ugo", nome: "Ugo Perottino" }, sigle, nomi), ["UPE"]);
  assert.deepEqual(sigleDi({ username: "x", nome: "Nessuno" }, sigle, nomi), []);
  // nome più corto o rovesciato (Visconti: in BConsole «Gian Paolo Visconti», nel CRM magari «Paolo Visconti»)
  const s2 = { GVI: "vpaolo" }, n2 = { vpaolo: "Gian Paolo Visconti" };
  assert.deepEqual(sigleDi({ username: "pvisconti", nome: "Paolo Visconti" }, s2, n2), ["GVI"]);
  assert.deepEqual(sigleDi({ username: "gp", nome: "VISCONTI GIAN PAOLO" }, s2, n2), ["GVI"]);
  assert.deepEqual(sigleDi({ username: "p", nome: "Paolo Rossi" }, s2, n2), []);
  assert.deepEqual(sigleDi({ username: "v", nome: "Visconti" }, s2, n2), []);
});

test("ricerca libera: tutte le parole, senza accenti, anche numeri di fattura e anno", () => {
  const c = contratto({ fatture: ["152/2026"], comune: "Cumianà" });
  assert.ok(corrisponde(c, "rossi marco"));
  assert.ok(corrisponde(c, "CUMIANA"));
  assert.ok(corrisponde(c, "152/2026"));
  assert.ok(corrisponde(c, "pvc 2026"));
  assert.ok(!corrisponde(c, "rossi torino"));
});

test("filtri e totali", () => {
  const prov = { id: "p", base: 10000, percentuale: 5, importo: 500, controllataIl: new Date(), liquidazioni: [] };
  const lista = [
    contratto({ chiave: "a", pagamenti: [pag(12200, 0, "PAGATA")], provvigione: prov }),
    contratto({ chiave: "b", data: new Date("2025-05-01"), imponibile: 2000, dovuto: 2440 }),
  ];
  assert.equal(filtra(lista, { anno: "2025" }).length, 1);
  assert.equal(filtra(lista, { pagamento: "PAGATO" })[0].chiave, "a");
  assert.equal(filtra(lista, { provvigione: "DA_CONTROLLARE" })[0].chiave, "b");
  const t = totali(lista);
  assert.deepEqual([t.contratti, t.venduto, t.incassato, t.daIncassare, t.provvigioni, t.daLiquidare, t.daControllare], [2, 12000, 12200, 2440, 500, 500, 1]);
});
