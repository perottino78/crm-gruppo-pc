import { test } from "node:test";
import assert from "node:assert/strict";
import { tipoIncasso, fatturaPer, causaleIncasso } from "../../src/lib/amministrazione/causale";

test("acconto o saldo: dalla scadenza della pratica, dal tipo di fattura o dalla descrizione", () => {
  assert.equal(tipoIncasso({ origine: "COMMESSA_ACCONTO" }), "ACCONTO");
  assert.equal(tipoIncasso({ origine: "COMMESSA_SALDO", tipoDocumento: "TD02" }), "SALDO");
  assert.equal(tipoIncasso({ origine: "FATTURA_VENDITA", tipoDocumento: "TD02" }), "ACCONTO");
  assert.equal(tipoIncasso({ origine: "MANUALE", descrizione: "Acconto lavori" }), "ACCONTO");
  assert.equal(tipoIncasso({ origine: "FATTURA_VENDITA", tipoDocumento: "TD01" }), "SALDO");
});

test("fattura da citare: l'ultima d'acconto per l'acconto, l'ultima normale per il saldo (mai le note di credito)", () => {
  const f = [
    { numero: "10/FE", tipoDocumento: "TD02", data: new Date("2026-10-01") },
    { numero: "40/FE", tipoDocumento: "TD01", data: new Date("2026-11-10") },
    { numero: "41/FE", tipoDocumento: "TD04", data: new Date("2026-11-12") },
  ];
  assert.equal(fatturaPer("ACCONTO", f)?.numero, "10/FE");
  assert.equal(fatturaPer("SALDO", f)?.numero, "40/FE");
  assert.equal(fatturaPer("ACCONTO", []), null);
});

test("causale come in BConsole", () => {
  assert.equal(causaleIncasso("SALDO", "2703/00"), "SALDO FT n. 2703/00");
  assert.equal(causaleIncasso("ACCONTO", null), "ACCONTO");
});
