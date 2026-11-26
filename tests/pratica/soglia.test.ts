import { test } from "node:test";
import assert from "node:assert/strict";
import { viaLiberaRilievo, mancaAllaSoglia } from "../../src/lib/pratica/soglia";

const base = { accontoTipo: "ACCONTO", finanziamentoStato: null, totale: 10000, incassato: 0, sbloccato: false };

test("il rilievo parte solo con il 50% incassato", () => {
  assert.equal(viaLiberaRilievo({ ...base, incassato: 3000 }), false);
  assert.equal(viaLiberaRilievo({ ...base, incassato: 5000 }), true);
  assert.equal(viaLiberaRilievo({ ...base, incassato: 4999.8 }), true, "tolleranza di 50 centesimi");
  assert.equal(mancaAllaSoglia(10000, 3000), 2000);
  assert.equal(mancaAllaSoglia(10000, 6000), 0);
});

test("acconto + rata intermedia arrivano al 50%", () => {
  assert.equal(viaLiberaRilievo({ ...base, incassato: 3000 + 2000 }), true);
});

test("finanziamento: conta l'approvazione; sblocco dell'amministratore vale sempre", () => {
  assert.equal(viaLiberaRilievo({ ...base, accontoTipo: "FINANZIAMENTO", finanziamentoStato: "IN_ISTRUTTORIA" }), false);
  assert.equal(viaLiberaRilievo({ ...base, accontoTipo: "FINANZIAMENTO", finanziamentoStato: "APPROVATO" }), true);
  assert.equal(viaLiberaRilievo({ ...base, incassato: 1000, sbloccato: true }), true);
});

test("caso Rita Esposito: fattura da 4.500 € saldata su una commessa da 9.000 € = 50%, il rilievo parte", () => {
  assert.equal(viaLiberaRilievo({ ...base, totale: 9000, incassato: 4500 }), true);
  assert.equal(viaLiberaRilievo({ ...base, totale: 9000, incassato: 4499.99 }), true, "un centesimo di arrotondamento non blocca");
  assert.equal(viaLiberaRilievo({ ...base, totale: 9000, incassato: 4499.3 }), false, "sotto la tolleranza resta bloccato");
  assert.equal(viaLiberaRilievo({ ...base, totale: 9001, incassato: 4500.5 }), true, "totale dispari: 50% = 4.500,50");
});
