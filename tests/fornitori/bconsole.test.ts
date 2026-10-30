import { test } from "node:test";
import assert from "node:assert/strict";
import { convertiFornitore, chiaveNome, normalizzaPiva, campiDaCompletare } from "../../src/lib/fornitori/bconsole";

test("stesso fornitore scritto in modi diversi", () => {
  assert.equal(chiaveNome("ALIAS S.R.L."), chiaveNome("Alias srl"));
  assert.equal(chiaveNome("G.F. EUROPA S.P.A."), chiaveNome("G F Europa spa"));
  assert.notEqual(chiaveNome("MV LIVING S.R.L."), chiaveNome("ALIAS S.R.L."));
});

test("partita IVA: prefisso IT e zeri", () => {
  assert.equal(normalizzaPiva("IT08092200727"), "08092200727");
  assert.equal(normalizzaPiva("00000000000"), null);
  assert.equal(normalizzaPiva(""), null);
});

test("conversione anagrafica BConsole", () => {
  const d = convertiFornitore({ id: "87", ord: 12, rag_soc: "MV LIVING S.R.L. ", ind: "S.P. 76", cap: "70028", cmn: "Sannicandro di Bari", prv: "ba", eml: "E.Valerio@MVLiving.it", prt_iva: "08092200727", codice_destinatario: "0000000", id_tip_pag_frn: "BONIFICO 50%", id_cen_cst: "Tende e Pergole" });
  assert.equal(d.ragioneSociale, "MV LIVING S.R.L.");
  assert.equal(d.provincia, "BA");
  assert.equal(d.email, "e.valerio@mvliving.it");
  assert.equal(d.codiceSdi, null);
  assert.equal(d.tipo, "AZIENDA");
  assert.match(d.note, /anagrafica n\. 87, 12 ordini/);
  assert.match(d.note, /Tende e Pergole/);
});

test("su un fornitore esistente completa solo i campi vuoti", () => {
  const extra = campiDaCompletare({ email: "scritta@amano.it", telefono: null, comune: "" } as Record<string, unknown>, { email: "altra@x.it", telefono: "011", comune: "Torino", note: "x" });
  assert.deepEqual(extra, { telefono: "011", comune: "Torino" });
});
