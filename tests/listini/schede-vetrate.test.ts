import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { schedaCliente, schedeDaAllegare } from "../../src/lib/preventivi/scheda-cliente";
import { SCHEDE_VETRATE } from "../../src/lib/listini/schede-vetrate";

test("Scintilla e Brillante hanno la scheda tecnica per il cliente", () => {
  const s = schedaCliente("VETRATA_SCINTILLA");
  const b = schedaCliente("VETRATA_BRILLANTE");
  assert.equal(s?.chiave, "SCINTILLA");
  assert.equal(b?.chiave, "BRILLANTE");
  assert.equal(s?.pagine.length, 8);
  assert.equal(b?.pagine.length, 12);
  assert.equal(schedaCliente("VETRATA_FISSO"), null);
});

test("i file delle schede esistono e non nominano il fornitore", () => {
  for (const c of Object.values(SCHEDE_VETRATE)) {
    assert.ok(existsSync(`public${c.pdf}`), c.pdf);
    for (let i = 1; i <= c.pagine; i++) assert.ok(existsSync(`public${c.cartella}/pagine/p-${i}.jpg`), `${c.cartella} pagina ${i}`);
    assert.ok(!/seeglass|c3 system|vepa/i.test(c.descrizione));
  }
});

test("spunta «allega»: una scheda per sistema, una volta sola", () => {
  const sc = schedeDaAllegare([
    { tipologia: "VETRATA_SCINTILLA", allegaScheda: true },
    { tipologia: "VETRATA_SCINTILLA", allegaScheda: true },
    { tipologia: "VETRATA_BRILLANTE", allegaScheda: false },
  ]);
  assert.deepEqual(sc.map((x) => x.chiave), ["SCINTILLA"]);
});
