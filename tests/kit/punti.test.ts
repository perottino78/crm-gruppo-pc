import { test } from "node:test";
import assert from "node:assert/strict";
import { regoleDa, puntiConsegna, classifica, kitDaConsegnare, periodoDi, puoConsegnareKit, REGOLE_KIT_DEFAULT, type ConsegnaMin } from "../../src/lib/kit/punti";

test("regole: valori di serie e letti dalla configurazione", () => {
  assert.deepEqual(regoleDa({}), REGOLE_KIT_DEFAULT);
  const r = regoleDa({ kit_punti_consegna: "20", kit_punti_foto: "x", kit_punti_recensione: "7,4", kit_premio_mese: "  Cena per due " });
  assert.equal(r.puntiConsegna, 20);
  assert.equal(r.puntiFoto, 5); // non valido → di serie
  assert.equal(r.puntiRecensione, 7);
  assert.equal(r.premioMese, "Cena per due");
  assert.equal(regoleDa({ kit_punti_foto: "-3" }).puntiFoto, 5);
  assert.equal(regoleDa({ kit_punti_foto: "0" }).puntiFoto, 0);
});

test("punti di una consegna", () => {
  const r = REGOLE_KIT_DEFAULT;
  assert.equal(puntiConsegna({ conFoto: false, recensione: false }, r), 10);
  assert.equal(puntiConsegna({ conFoto: true, recensione: false }, r), 15);
  assert.equal(puntiConsegna({ conFoto: true, recensione: true }, r), 25);
});

test("periodo di Roma: l'ultima sera del mese conta nel mese giusto", () => {
  assert.equal(periodoDi(new Date("2026-11-30T23:30:00Z"), "mese"), "2026-12"); // a Roma è già il 1° dicembre
  assert.equal(periodoDi(new Date("2026-11-30T22:30:00Z"), "mese"), "2026-11");
  assert.equal(periodoDi(new Date("2026-06-15T10:00:00Z"), "anno"), "2026");
});

test("classifica del mese con pari merito", () => {
  const c = (utenteId: string, nome: string, giorno: string, punti: number, foto = false): ConsegnaMin =>
    ({ utenteId, utenteNome: nome, consegnatoIl: new Date(giorno + "T10:00:00Z"), punti, conFoto: foto, recensione: false });
  const lista = [
    c("m", "Marco", "2026-11-03", 15, true), c("m", "Marco", "2026-11-10", 10),
    c("p", "Paolo", "2026-11-05", 25),
    c("l", "Laura", "2026-11-06", 15), c("l", "Laura", "2026-11-07", 10),
    c("c", "Claudio", "2026-10-30", 50), // altro mese
  ];
  const k = classifica(lista, "2026-11");
  assert.deepEqual(k.map((x) => [x.nome, x.punti, x.kit, x.posizione]), [["Laura", 25, 2, 1], ["Marco", 25, 2, 1], ["Paolo", 25, 1, 3]]);
  assert.equal(k.find((x) => x.nome === "Marco")!.foto, 1);
  assert.equal(classifica(lista, "2026").length, 4);
});

test("kit da consegnare: solo a lavoro finito e senza kit, i più vecchi prima", () => {
  assert.equal(puoConsegnareKit("ORDINI"), false);
  assert.equal(puoConsegnareKit("POSA"), true);
  const d = (s: string) => new Date(s);
  const lista = [
    { id: "a", stato: "CHIUSA", dataFine: d("2026-11-10") },
    { id: "b", stato: "ORDINI", dataFine: null },
    { id: "c", stato: "LAVORI_ESEGUITI", dataFine: d("2026-11-01") },
    { id: "e", stato: "POSA", dataFine: d("2026-11-05") },
  ];
  assert.deepEqual(kitDaConsegnare(lista, new Set(["e"])).map((x) => x.id), ["c", "a"]);
});
