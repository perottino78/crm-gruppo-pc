import { test } from "node:test";
import assert from "node:assert/strict";
import { righeDaProgetto, eRigaStudio, copertinaSostituibile, tipoRiga } from "../../src/lib/solaris/porta-in-offerta";
import { leggiSchedeSolaris, rigaConSchedaSolaris } from "../../src/lib/solaris/schede-offerta";

const base = {
  kwp: 5.28, numeroPannelli: 12, batteria: 5, costoKwp: 1000, costoBatteria: 500, stato: { sottostruttura: 300 },
  pannello: { nome: "Jinko Tiger Neo 440 W", potenzaW: 440, prezzoVendita: 125 },
  inverter: { nome: "Huawei SUN2000-6KTL", prezzoVendita: 1400 },
  batteriaModello: null,
};

test("righe dallo Studio: tutti i pannelli scelti, inverter, accumulo, installazione e kit", () => {
  const r = righeDaProgetto(base);
  assert.equal(r[0].quantita, 12);
  assert.match(r[0].testoLibero, /^☀️ Pannello Jinko Tiger Neo 440 W 440W — 12 pz \(5,28 kWp totali\)$/);
  assert.equal(r[0].prezzoUnitario, 125);
  assert.match(r[1].testoLibero, /^☀️ Inverter /);
  assert.equal(r[2].prezzoUnitario, 2500); // 5 kWh × 500
  assert.equal(r[3].prezzoUnitario, 5280);
  assert.equal(r[4].testoLibero, "☀️ Sottostruttura e staffe");
  assert.ok(r.every((x) => eRigaStudio({ testoLibero: x.testoLibero, prodottoId: null })));
});

test("batteria a moduli: moduli per i kWh scelti", () => {
  const r = righeDaProgetto({ ...base, batteriaModello: { nome: "Stealth SP-HEV50 5 kWh", potenzaW: 5000, prezzoVendita: 0 }, batteria: 10 });
  const b = r.find((x) => tipoRiga(x.testoLibero) === "Batteria")!;
  assert.equal(b.quantita, 2);
  assert.equal(b.prezzoUnitario, 2500);
});

test("righe dello Studio riconosciute e copertina", () => {
  assert.equal(eRigaStudio({ testoLibero: "☀️ Inverter X", prodottoId: "p1" }), false);
  assert.equal(eRigaStudio({ testoLibero: "Nota", prodottoId: null }), false);
  assert.equal(copertinaSostituibile(null), true);
  assert.equal(copertinaSostituibile("/api/solaris/foto/abc"), true);
  assert.equal(copertinaSostituibile("https://esempio.it/render.jpg"), false);
  assert.equal(tipoRiga("☀️ Pannello Jinko"), "Pannello");
  assert.equal(rigaConSchedaSolaris("☀️ Batteria Stealth"), true);
  assert.equal(rigaConSchedaSolaris("☀️ Installazione, cavi"), false);
});

test("schede salvate dallo Studio: ripulite", () => {
  const s = leggiSchedeSolaris({ schedeOfferta: [{ titolo: "Modulo X", voci: [["Efficienza", "22,8%"], ["", "x"], "rotto"] }, { titolo: "" }] });
  assert.deepEqual(s, [{ titolo: "Modulo X", voci: [["Efficienza", "22,8%"]] }]);
  assert.deepEqual(leggiSchedeSolaris(null), []);
});
