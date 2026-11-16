import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGO_STEALTH, moduliPer } from "../../src/lib/solaris/stealth";

test("catalogo Stealth: inverter del listino Italia e batteria SP-HEV50", () => {
  const nomi = CATALOGO_STEALTH.map((c) => c.nome);
  for (const s of ["ST-INV-S4.0", "ST-INV-S5.0", "ST-INV-S6.0", "ST-INV-T10.0", "SP-HEV50"])
    assert.ok(nomi.some((n) => n.includes(s)), s);
  assert.equal(new Set(nomi).size, nomi.length, "nomi doppi");
});

test("catalogo Stealth: fasi, potenze e prezzi da completare", () => {
  for (const c of CATALOGO_STEALTH) {
    assert.ok(c.potenzaW > 0);
    if (c.categoria === "INVERTER") assert.equal(c.faseTipo, c.nome.includes("-T") ? "TRIFASE" : "MONOFASE");
  }
  const t10 = CATALOGO_STEALTH.find((c) => c.nome.includes("ST-INV-T10.0"))!;
  assert.equal(t10.potenzaW, 10000);
  const hev = CATALOGO_STEALTH.find((c) => c.nome.includes("SP-HEV50"))!;
  assert.equal(hev.potenzaW, 5000);
});

test("moduli di batteria per i kWh richiesti", () => {
  assert.equal(moduliPer(10, 5), 2);
  assert.equal(moduliPer(5, 2.76), 2);
  assert.equal(moduliPer(15, 5), 3);
  assert.equal(moduliPer(0, 5), 0);
});
