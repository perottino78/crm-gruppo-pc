import { test } from "node:test";
import assert from "node:assert/strict";
import { optionalFormePersiane } from "../../src/lib/listini/allinea-optional";

test("persiane: centinata +60% e trapezio +50%", () => {
  const v = optionalFormePersiane("PERSIANE_GOCCIA");
  assert.equal(v.find((x) => x.nome.includes("centinata"))?.valore, 60);
  assert.equal(v.find((x) => x.nome.includes("trapezio"))?.valore, 50);
  assert.ok(v.every((x) => x.tipoPrezzo === "PERCENTUALE" && x.listino === "PERSIANE_GOCCIA"));
});
