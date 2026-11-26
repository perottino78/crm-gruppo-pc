import { test } from "node:test";
import assert from "node:assert/strict";
import { ordinaPassaggi } from "../../src/lib/pratica/ordina-passaggi";

const g = (n: number) => new Date(2026, 10, n);
const t = (id: string, faseChiave: string | null, giorno: number) => ({ id, faseChiave, createdAt: g(giorno) });
const ids = (l: { id: string }[]) => l.map((x) => x.id).join(",");

test("Fatturazione (acconto) prima di Amministrazione (incasso) anche se l'incasso è arrivato prima", () => {
  const r = ordinaPassaggi([t("incasso", "PROGETTO", 1), t("fattura", "FATT_ACCONTO", 2), t("acc", "ACCETTAZIONE", 0)]);
  assert.equal(ids(r), "acc,fattura,incasso");
});

test("segue tutta la catena del flusso", () => {
  const r = ordinaPassaggi([t("kit", "KIT", 1), t("posa", "POSA", 2), t("mag", "MAGAZZINO", 3), t("ord", "ORDINI", 4), t("ril", "RILIEVO", 5), t("app", "RILIEVO_APP", 6), t("prog", "PROGETTO", 7), t("fatt", "FATT_ACCONTO", 8)]);
  assert.equal(ids(r), "fatt,prog,app,ril,ord,mag,posa,kit");
});

test("i task liberi stanno dopo il passaggio più vicino che li precede per data", () => {
  const r = ordinaPassaggi([t("incasso", "PROGETTO", 2), t("libero", null, 3), t("fattura", "FATT_ACCONTO", 1), t("rilievo", "RILIEVO_APP", 5)]);
  assert.equal(ids(r), "fattura,incasso,libero,rilievo");
});

test("un libero più vecchio di tutti va in testa; fasi sconosciute come i liberi", () => {
  const r = ordinaPassaggi([t("fattura", "FATT_ACCONTO", 2), t("strano", "FASE_NUOVA", 1)]);
  assert.equal(ids(r), "strano,fattura");
});

test("stessa fase due volte: per data; non muta l'elenco di partenza", () => {
  const input = [t("b", "RILIEVO", 4), t("a", "RILIEVO", 3)];
  assert.equal(ids(ordinaPassaggi(input)), "a,b");
  assert.equal(ids(input), "b,a");
});
