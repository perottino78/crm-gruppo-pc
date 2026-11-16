import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  VOCI_SOLARIS_BC, posizioneSolarisBC, labelSolarisBC, nomePulito, scontoAcquistoBC, varianteSolarisBC, inProvvigioneSolarisBC, PREZZI_STEALTH_BC,
} from "../../src/lib/listini/solaris-bconsole";
import { CATALOGO_STEALTH } from "../../src/lib/solaris/stealth";
import { sottogruppoDiTipologia, labelBreveTipologia } from "../../src/lib/prodotti";

test("listino Solaris da BConsole: voci uniche, con prezzo, posizione nel listino e foto", () => {
  assert.ok(VOCI_SOLARIS_BC.length >= 100);
  assert.equal(new Set(VOCI_SOLARIS_BC.map((v) => v.tipologia)).size, VOCI_SOLARIS_BC.length, "niente doppioni");
  for (const v of VOCI_SOLARIS_BC) {
    assert.ok(v.vendita > 0 && v.vendita < 60000, `${v.codice}: prezzo`);
    assert.ok(posizioneSolarisBC(v.tipologia), `${v.codice}: gruppo`);
    if (v.immagine) assert.ok(existsSync(`public${v.immagine}`), `${v.codice}: foto`);
  }
  assert.ok(!VOCI_SOLARIS_BC.some((v) => /CLIMATIZZATORE|CONDIZIONAR/i.test(v.nome)), "i climatizzatori sono già a listino");
});

test("fotovoltaico: kit, inverter e batterie Stealth al posto giusto, nomi corretti", () => {
  const kit = VOCI_SOLARIS_BC.find((v) => v.codice === "KIT6KWH/10KWSOL")!;
  assert.equal(kit.vendita, 14000);
  assert.deepEqual(posizioneSolarisBC(kit.tipologia), { gruppo: "FOTOVOLTAICO", sottogruppo: "Impianti completi (kit)" });
  const t10 = VOCI_SOLARIS_BC.find((v) => v.codice.includes("ST-INV-T10"))!;
  assert.equal(sottogruppoDiTipologia(t10.tipologia), "Inverter");
  assert.equal(labelBreveTipologia(t10.tipologia), "INVERTER IBRIDO 10KWH SOLARIS ST-INV-T10.0 TRIFASE");
  const posa = VOCI_SOLARIS_BC.find((v) => v.codice === "PSTKW")!;
  assert.equal(posizioneSolarisBC(posa.tipologia)?.sottogruppo, "Posa e pratiche");
  assert.equal(varianteSolarisBC(posa.um), "Al kW installato");
  assert.equal(inProvvigioneSolarisBC(VOCI_SOLARIS_BC.find((v) => v.codice === "PRATICHE")!), false);
  assert.equal(nomePulito("PANNELLO FOTOVOLTAIVO VDS 460 W TOTAL BLECK"), "PANNELLO FOTOVOLTAICO VDS 460 W TOTAL BLACK");
  assert.match(labelSolarisBC(VOCI_SOLARIS_BC.find((v) => v.codice === "BAT/10ST")!.tipologia) ?? "", /STEALTH/);
});

test("costo d'acquisto come sconto sul prezzo di vendita; prezzi Stealth per Solaris Studio", () => {
  assert.equal(scontoAcquistoBC({ vendita: 3920, acquisto: 1225 }), 68.75);
  assert.equal(scontoAcquistoBC({ vendita: 750, acquisto: 0 }), null);
  const nomi = new Set(CATALOGO_STEALTH.map((c) => c.nome));
  for (const n of Object.keys(PREZZI_STEALTH_BC)) assert.ok(nomi.has(n), `${n} è nel catalogo dello Studio`);
});
