import { test } from "node:test";
import assert from "node:assert/strict";
import { riepilogoIvaRighe, importoRigaOfferta } from "../../src/lib/preventivi/iva";

test("IVA per riga: due aliquote, sconto su tutte", () => {
  const r = riepilogoIvaRighe([{ importo: 1000, aliquota: null }, { importo: 2000, aliquota: 10 }], 10, 22);
  assert.deepEqual(r, [{ aliquota: 22, imponibile: 900, iva: 198 }, { aliquota: 10, imponibile: 1800, iva: 180 }]);
});
test("senza aliquote sulle righe vale quella dell'offerta", () => {
  const r = riepilogoIvaRighe([{ importo: 100, aliquota: null }, { importo: 50, aliquota: null }], 0, 22);
  assert.equal(r.length, 1); assert.equal(r[0].iva, 33);
});
test("importo riga con optional", () => {
  assert.equal(importoRigaOfferta({ quantita: 2, prezzoUnitario: 100, optionalPrezzo: 50, optionali: [{ quantita: 1, prezzoUnitario: 25 }] }), 275);
});
