import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { convertiInWebp } from "../../src/lib/immagini/webp";

test("una foto JPG diventa WebP più leggera e ridotta", async () => {
  const jpg = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg({ quality: 95 }).toBuffer();
  const r = await convertiInWebp({ contenuto: jpg, mime: "image/jpeg", nome: "Foto Prova.JPG" }, 1200);
  assert.equal(r.mime, "image/webp");
  assert.equal(r.nome, "Foto Prova.webp");
  const meta = await sharp(r.contenuto).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(Math.max(meta.width!, meta.height!) <= 1200);
  assert.ok(r.contenuto.length < jpg.length);
});

test("PDF, GIF e file non validi restano come sono", async () => {
  const pdf = { contenuto: Buffer.from("%PDF-1.4"), mime: "application/pdf", nome: "a.pdf" };
  assert.deepEqual(await convertiInWebp(pdf), pdf);
  const rotto = { contenuto: Buffer.from("non è una foto"), mime: "image/png", nome: "b.png" };
  assert.deepEqual(await convertiInWebp(rotto), rotto);
});
