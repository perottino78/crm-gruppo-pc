import { test } from "node:test";
import assert from "node:assert/strict";
import { prodottiTaglioFreddo, optionalTaglioFreddo, labelTaglioFreddo, descrizioneTaglioFreddo, scontoQuantitaTaglioFreddo, fotoTaglioFreddo } from "../../src/lib/listini/taglio-freddo";
import { sottogruppoDiTipologia, labelBreveTipologia, listinoDiTipologia, assiSelezioneIsomax, unitaMisura } from "../../src/lib/prodotti";

test("10 tariffe al m² come da listino (le combinazioni «/» non ci sono)", () => {
  const p = prodottiTaglioFreddo();
  assert.equal(p.length, 10);
  const prezzo = (t: string) => p.find((x) => x.tipologia === t)?.prezzoBase;
  assert.equal(prezzo("TAGLIOFREDDO_SCORR_33"), 510);
  assert.equal(prezzo("TAGLIOFREDDO_SCORR_VC"), 541.44);
  assert.equal(prezzo("TAGLIOFREDDO_SCORRTT_VC"), 705.6);
  assert.equal(prezzo("TAGLIOFREDDO_SCORRTT_33"), undefined);
  assert.equal(prezzo("TAGLIOFREDDO_BATT_33"), 480);
  assert.equal(prezzo("TAGLIOFREDDO_BATT_VC"), 512.64);
  assert.equal(prezzo("TAGLIOFREDDO_BATTTT_VC"), 720);
  assert.equal(prezzo("TAGLIOFREDDO_PIEG_33"), 735);
  assert.equal(prezzo("TAGLIOFREDDO_PIEG_VC"), 757.44);
  assert.equal(prezzo("TAGLIOFREDDO_FISSO_33"), 360);
  assert.equal(prezzo("TAGLIOFREDDO_FISSO_VC"), 395);
  assert.ok(p.every((x) => x.colore === "TARIFFA AL M²" && x.larghezzaMm === 100 && x.altezzaMm === 100));
});

test("etichette, tendine, listino, sottogruppo e misure in cm", () => {
  assert.equal(labelTaglioFreddo("TAGLIOFREDDO_PIEG_VC"), "Pieghevole (taglio freddo) — Vetrocamera 2+2/12/4");
  assert.equal(labelBreveTipologia("TAGLIOFREDDO_BATT_33"), "Battente (taglio freddo) — Vetro 3+3 (stratificato)");
  assert.deepEqual(assiSelezioneIsomax("TAGLIOFREDDO_SCORRTT_VC")?.apertura, { valore: "VC", label: "Vetrocamera 2+2/12/4" });
  assert.equal(listinoDiTipologia("TAGLIOFREDDO_FISSO_33"), "TAGLIOFREDDO");
  assert.equal(sottogruppoDiTipologia("TAGLIOFREDDO_FISSO_33"), "Alluminio — Taglio freddo e verande");
  assert.equal(unitaMisura("TAGLIOFREDDO_FISSO_33"), "cm");
  assert.equal(labelTaglioFreddo("TAGLIOFREDDO_SCORRTT_33"), null);
  assert.match(descrizioneTaglioFreddo("TAGLIOFREDDO_SCORR_33") ?? "", /scorrevole parallelo.*3\+3/i);
  assert.equal(fotoTaglioFreddo("TAGLIOFREDDO_PIEG_33"), "/immagini/taglio-freddo/pieghevole.jpg");
});

test("supplementi, colori e sconti", () => {
  const o = optionalTaglioFreddo();
  const v = (nome: string) => o.find((x) => x.nome.startsWith(nome));
  assert.equal(v("Smontaggio")?.valore, 24);
  assert.equal(v("Smontaggio")?.unita, "m²");
  assert.equal(v("Scorrevole su doppio telaio")?.valore, 720);
  assert.equal(v("Foro")?.valore, 100);
  assert.equal(v("Inserto a wasistas")?.valore, 245);
  assert.deepEqual([v("Serramento centinato")?.tipoPrezzo, v("Serramento centinato")?.valore], ["PERCENTUALE", 40]);
  assert.equal(v("Altri colori")?.valore, 10);
  assert.equal(o.filter((x) => x.categoria === "Colore" && x.valore === 0).length, 3);
  assert.deepEqual(o.filter((x) => x.categoria === "Sconti per quantità").map((x) => x.valore), [-5, -10, -15]);
  assert.ok(o.every((x) => x.listino === "TAGLIOFREDDO"));
  assert.deepEqual([10, 10.5, 20.1, 30, 31].map(scontoQuantitaTaglioFreddo), [0, 5, 10, 10, 15]);
});
