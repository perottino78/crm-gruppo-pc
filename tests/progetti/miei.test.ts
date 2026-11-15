import { test } from "node:test";
import assert from "node:assert/strict";
import { semaforoConsegna, filtraProgetti, ordinaProgetti, percentualePagata, riepilogoProgetti, type ProgettoMin } from "../../src/lib/progetti/miei";

const oggi = new Date("2026-11-16T10:00:00Z");
const g = (n: number) => new Date(oggi.getTime() + n * 86400000);
const p = (o: Partial<ProgettoMin>): ProgettoMin => ({
  stato: "ORDINI", consegnaPrevista: null, totale: 10000, pagato: 0, accontoIncassato: false,
  cliente: "Mario Rossi", numero: "C2026-001", oggetto: null, commerciale: "Marco Piccatti", ...o,
});

test("semaforo della consegna", () => {
  assert.equal(semaforoConsegna(p({ consegnaPrevista: g(-1) }), oggi), "SCADUTA");
  assert.equal(semaforoConsegna(p({ consegnaPrevista: g(3) }), oggi), "VICINA");
  assert.equal(semaforoConsegna(p({ consegnaPrevista: g(7) }), oggi), "VICINA");
  assert.equal(semaforoConsegna(p({ consegnaPrevista: g(20) }), oggi), "OK");
  assert.equal(semaforoConsegna(p({}), oggi), "NESSUNA");
  assert.equal(semaforoConsegna(p({ stato: "CHIUSA", consegnaPrevista: g(-30) }), oggi), "FINITA");
});

test("filtro per vista e ricerca senza accenti", () => {
  const lista = [
    p({ cliente: "Niccolò Bianchi", numero: "C2026-010" }),
    p({ cliente: "Anna Verdi", stato: "LAVORI_ESEGUITI" }),
    p({ cliente: "Luca Neri", stato: "ANNULLATA" }),
  ];
  assert.deepEqual(filtraProgetti(lista, "CORSO", "").map((x) => x.cliente), ["Niccolò Bianchi"]);
  assert.deepEqual(filtraProgetti(lista, "FINITI", "").map((x) => x.cliente), ["Anna Verdi"]);
  assert.equal(filtraProgetti(lista, "TUTTI", "").length, 3);
  assert.deepEqual(filtraProgetti(lista, "TUTTI", "niccolo 010").map((x) => x.cliente), ["Niccolò Bianchi"]);
  assert.equal(filtraProgetti(lista, "TUTTI", "niccolo verdi").length, 0);
});

test("ordine: scadute, vicine, poi per data; senza data e finite in fondo", () => {
  const lista = [
    p({ cliente: "Senza data" }),
    p({ cliente: "Lontana", consegnaPrevista: g(40) }),
    p({ cliente: "Finita", stato: "CHIUSA", consegnaPrevista: g(-5) }),
    p({ cliente: "Vicina", consegnaPrevista: g(2) }),
    p({ cliente: "Scaduta", consegnaPrevista: g(-2) }),
    p({ cliente: "Media", consegnaPrevista: g(15) }),
  ];
  assert.deepEqual(ordinaProgetti(lista, oggi).map((x) => x.cliente), ["Scaduta", "Vicina", "Media", "Lontana", "Senza data", "Finita"]);
});

test("percentuale pagata e riepilogo", () => {
  assert.equal(percentualePagata(p({ totale: 18480, pagato: 5544 })), 30);
  assert.equal(percentualePagata(p({ totale: 0, pagato: 10 })), 0);
  assert.equal(percentualePagata(p({ totale: 100, pagato: 150 })), 100);
  const r = riepilogoProgetti([
    p({ consegnaPrevista: g(-1), pagato: 3000, accontoIncassato: true }),
    p({ consegnaPrevista: g(5) }),
    p({ consegnaPrevista: g(30), pagato: 10000, accontoIncassato: true }),
    p({ stato: "CHIUSA", pagato: 0 }),
  ], oggi);
  assert.deepEqual(r, { inCorso: 3, vicine: 1, scadute: 1, attesaAcconto: 1, daIncassare: 17000 });
});
