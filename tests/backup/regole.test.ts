import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BYTE_PER_PARTE, chiaveGiusta, elencoTesto, esitoDaModulo, impronta, nomeValido, nuovaChiave, partiBackup, partiDi, statoBackup, tipoBackup,
} from "../../src/lib/backup/regole";
import { SCRIPT_NAS, scriptPer } from "../../src/lib/backup/script";

test("parti: tabelle piccole in una parte, grandi divise, senza id una sola", () => {
  assert.equal(partiDi({ nome: "Cliente", byte: 1000, haId: true }), 1);
  assert.equal(partiDi({ nome: "Documento", byte: BYTE_PER_PARTE * 5 + 1, haId: true }), 6);
  assert.equal(partiDi({ nome: "_AToB", byte: BYTE_PER_PARTE * 5, haId: false }), 1);
});

test("backup dati senza le tabelle dei file, completo con tutto; nomi strani esclusi", () => {
  const t = [
    { nome: "Documento", byte: BYTE_PER_PARTE * 2, haId: true }, { nome: "Cliente", byte: 10, haId: true },
    { nome: "PosaFoto", byte: 10, haId: true }, { nome: "x; DROP", byte: 1, haId: true },
  ];
  assert.deepEqual(partiBackup(t, "dati").map((p) => p.tabella), ["Cliente"]);
  const c = partiBackup(t, "completo");
  assert.deepEqual(c.map((p) => `${p.tabella}.${p.parte}/${p.parti}`), ["Cliente.0/1", "Documento.0/2", "Documento.1/2", "PosaFoto.0/1"]);
  assert.equal(tipoBackup("completo"), "completo");
  assert.equal(tipoBackup("altro"), "dati");
  assert.ok(!nomeValido('Cliente"'));
});

test("elenco in testo per lo script del NAS", () => {
  const s = elencoTesto([{ tabella: "Cliente", parte: 0, parti: 1 }], { tipo: "dati" });
  assert.equal(s, "# tipo dati\nCliente 0 1\n");
});

test("chiave: solo l'impronta si salva, confronto giusto", () => {
  const k = nuovaChiave();
  assert.ok(k.length >= 40);
  assert.ok(chiaveGiusta(k, impronta(k)));
  assert.ok(!chiaveGiusta(k + "x", impronta(k)));
  assert.ok(!chiaveGiusta("", impronta(k)));
  assert.ok(!chiaveGiusta(k, null));
});

test("resoconto dal NAS ripulito", () => {
  const e = esitoDaModulo({ tipo: "completo", cartella: "2026-11-29-completo/../x", file: "12", byte: "-5", errori: "abc", durata: "61", libero: "1000" }, new Date("2026-11-29T01:10:00Z"));
  assert.deepEqual(e, { il: "2026-11-29T01:10:00.000Z", tipo: "completo", cartella: "2026-11-29-completo..x", file: 12, byte: 0, errori: 0, durata: 61, liberoKB: 1000 });
});

test("stato: ok, errori, fermo dopo 36 ore, mai", () => {
  const adesso = new Date("2026-11-25T12:00:00Z");
  const e = (il: string, errori: number) => ({ il, tipo: "dati" as const, cartella: "x", file: 1, byte: 1, errori, durata: 1 });
  assert.equal(statoBackup("2026-11-25T01:00:00Z", e("2026-11-25T01:00:00Z", 0), "2026-11-01T00:00:00Z", adesso).livello, "ok");
  assert.equal(statoBackup("2026-11-24T01:00:00Z", e("2026-11-25T01:00:00Z", 3), "2026-11-01T00:00:00Z", adesso).livello, "errori");
  assert.equal(statoBackup("2026-11-23T01:00:00Z", null, "2026-11-01T00:00:00Z", adesso).livello, "fermo");
  assert.equal(statoBackup(null, null, "2026-11-25T10:00:00Z", adesso).livello, "mai");
  assert.equal(statoBackup(null, null, "2026-11-20T10:00:00Z", adesso).livello, "fermo");
});

test("lo script servito è quello di scripts/backup/backup-one.sh, con l'indirizzo giusto", () => {
  assert.equal(SCRIPT_NAS, readFileSync("scripts/backup/backup-one.sh", "utf8"));
  const s = scriptPer("https://crm-gruppo-pc.vercel.app/");
  assert.ok(s.includes('URL="https://crm-gruppo-pc.vercel.app"'));
  assert.ok(!s.includes("__URL__"));
});
