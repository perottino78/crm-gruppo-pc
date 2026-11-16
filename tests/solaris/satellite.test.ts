import { test } from "node:test";
import assert from "node:assert/strict";
import { metriPerPixel, pixelGlobale, tessereRiquadro, tesseraValida } from "../../src/lib/solaris/satellite";

test("scala: a Rosta (45° N) zoom 19 ≈ 0,21 m per pixel", () => {
  const m = metriPerPixel(45.08, 19);
  assert.ok(m > 0.2 && m < 0.22, String(m));
  assert.ok(Math.abs(metriPerPixel(45.08, 20) * 2 - m) < 1e-9);
});

test("pixel globali: Greenwich/equatore al centro del mondo", () => {
  const p = pixelGlobale(0, 0, 1);
  assert.equal(p.x, 256);
  assert.ok(Math.abs(p.y - 256) < 1e-9);
});

test("riquadro: le tessere coprono tutto il lato richiesto", () => {
  const t = tessereRiquadro(45.0705, 7.47, 19, 192);
  assert.ok(t.length >= 1 && t.length <= 4);
  for (const k of t) {
    assert.ok(k.dx > -256 && k.dx < 192);
    assert.ok(k.dy > -256 && k.dy < 192);
  }
});

test("tessera valida: niente zoom o coordinate fuori misura", () => {
  assert.equal(tesseraValida(19, 272000, 188000), true);
  assert.equal(tesseraValida(10, 1, 1), false);
  assert.equal(tesseraValida(19, -1, 5), false);
  assert.equal(tesseraValida(19, 2 ** 19, 5), false);
  assert.equal(tesseraValida(19.5, 1, 1), false);
});
