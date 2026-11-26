import { test } from "node:test";
import assert from "node:assert/strict";
import { provvigioneDaPagare, fineMesePrecedente, type Contratto } from "../../src/lib/provvigioni/calcoli";
import { reportMensile, csvReport, mesePrecedenteDi } from "../../src/lib/provvigioni/report";

// Regola di Debora (23/11/2026): 80% a titolo di acconto se il cliente ha pagato il 50% entro il mese scorso,
// 20% a saldo se la pratica è posata e il cliente ha pagato tutto entro il mese scorso.

const contratto = (o: Partial<Contratto> = {}): Contratto => ({
  chiave: "C:1", origine: "CRM", numero: "C2026-001", data: new Date("2026-05-10"), clienteNome: "Rossi Mario", comune: "Rivoli",
  marchio: "P&C", descrizione: "Infissi in PVC", stato: "IN_CORSO", commercialeId: "u1", commercialeNome: "Marco Piccatti",
  imponibile: 10000, dovuto: 12200, fatture: [], pagamenti: [], provvigione: null, ...o,
});
const prov1000 = (liquidazioni: { id: string; importo: number; data: Date }[] = []) => ({ id: "p", base: 10000, percentuale: 10, importo: 1000, controllataIl: new Date(), liquidazioni });
const pagA = (importo: number, data: string) => ({ id: data + importo, descrizione: "x", importo, incassato: importo, residuo: 0, scadenza: null, ultimoIncasso: new Date(data), stato: "PAGATA" });
const crm = (o: Partial<Contratto> = {}) => contratto({ dovuto: 12200, provvigione: prov1000(), pagamenti: [pagA(6100, "2026-10-20")], posatoIl: null, ...o });
const fineNov = fineMesePrecedente(2026, 11);

test("report mensile: 80% se il 50% è pagato entro il mese scorso, non se pagato dopo", () => {
  assert.equal(provvigioneDaPagare(crm(), fineNov)!.daPagare, 800);
  assert.equal(provvigioneDaPagare(crm({ pagamenti: [pagA(6100, "2026-11-03")] }), fineNov)!.daPagare, 0);
  // pagato il 30 novembre sera: conta per il report di dicembre
  assert.equal(provvigioneDaPagare(crm({ pagamenti: [pagA(6100, "2026-11-30T22:00:00Z")] }), fineMesePrecedente(2026, 12))!.daPagare, 800);
  // il report di ottobre guarda fine settembre: l'acconto del 20/10 non c'era ancora
  assert.equal(provvigioneDaPagare(crm(), fineMesePrecedente(2026, 10))!.daPagare, 0);
});

test("report mensile: 20% se posata e tutto pagato entro il mese scorso, non se posata dopo", () => {
  const chiuso = crm({ pagamenti: [pagA(6100, "2026-10-20"), pagA(6100, "2026-10-28")], posatoIl: new Date("2026-10-30") });
  assert.equal(provvigioneDaPagare(chiuso, fineNov)!.daPagare, 1000);
  const r = provvigioneDaPagare({ ...chiuso, posatoIl: new Date("2026-11-05") }, fineNov)!;
  assert.deepEqual([r.daPagare, r.saldoStato], [800, "NO"]);
  // posata, ma il saldo è stato pagato dopo la fine del mese
  const saldoDopo = provvigioneDaPagare(crm({ pagamenti: [pagA(6100, "2026-10-20"), pagA(6100, "2026-11-10")], posatoIl: new Date("2026-10-30") }), fineNov)!;
  assert.equal(saldoDopo.daPagare, 800);
  assert.deepEqual(saldoDopo.note, ["il cliente non ha pagato tutto"]);
});

test("report mensile: liquidazione parziale già fatta si toglie; BConsole senza posa resta all'80%", () => {
  const chiuso = crm({ pagamenti: [pagA(6100, "2026-10-20"), pagA(6100, "2026-10-28")], posatoIl: new Date("2026-10-30") });
  assert.equal(provvigioneDaPagare({ ...chiuso, provvigione: prov1000([{ id: "l", importo: 800, data: new Date() }]) }, fineNov)!.daPagare, 200);
  assert.equal(provvigioneDaPagare({ ...chiuso, provvigione: prov1000([{ id: "l", importo: 300, data: new Date() }]) }, fineNov)!.daPagare, 700);
  const r = provvigioneDaPagare(crm({ origine: "BCONSOLE", pagamenti: [pagA(12200, "2026-10-20")] }), fineNov)!;
  assert.deepEqual([r.daPagare, r.saldoStato], [800, "DA_VERIFICARE"]);
});

test("report mensile: raggruppa per commerciale, totali e CSV con punto e virgola", () => {
  const a = crm({ chiave: "C:a", numero: "C2026-001", clienteNome: "Rossi", commercialeId: "u1", commercialeNome: "Marco" });
  const b = crm({ chiave: "C:b", numero: "C2026-002", clienteNome: "Bianchi; Luca", commercialeId: "u2", commercialeNome: "Anna", pagamenti: [pagA(12200, "2026-10-20")], posatoIl: new Date("2026-10-25") });
  const senza = crm({ chiave: "C:c", provvigione: null });
  const nulla = crm({ chiave: "C:d", pagamenti: [] });
  const r = reportMensile([a, b, senza, nulla], "2026-11");
  assert.deepEqual(r.gruppi.map((g) => [g.nome, g.daPagare]), [["Anna", 1000], ["Marco", 800]]);
  assert.equal(r.totaleDaPagare, 1800);
  const csv = csvReport(r.gruppi);
  assert.ok(csv.startsWith("﻿Commerciale;Cliente;"));
  assert.ok(csv.includes('Anna;"Bianchi; Luca";C2026-002;1000,00;800,00;200,00;1000,00;0,00;1000,00;'));
  assert.ok(csv.includes("Totale Marco;;;;;;800,00;0,00;800,00;"));
  assert.equal(mesePrecedenteDi("2026-01"), "2025-12");
  assert.equal(mesePrecedenteDi("2026-11"), "2026-10");
});
