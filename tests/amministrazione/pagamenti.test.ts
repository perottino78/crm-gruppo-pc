import { test } from "node:test";
import assert from "node:assert/strict";
import { ritenutaPrevista, controllaPagamento, confermePagamentiManuali, nomeMetodo, METODI_PAGAMENTO } from "../../src/lib/amministrazione/pagamenti";
import { residuoScadenza } from "../../src/lib/amministrazione/server";
import { nomeNorm, conDetrazione, sezionaleDaNumero, statoVendita, rateIncasso, chiaveVendita } from "../../src/lib/fatture/vendite";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

test("ritenuta 11% del bonifico parlante: lordo : 1,22 × 11 / 100 (formula di Debora)", () => {
  assert.equal(ritenutaPrevista(492.06), 44.37); // 492,06 : 1,22 = 403,33 → 44,37
  assert.equal(ritenutaPrevista(1220), 110); // 1220 : 1,22 = 1000 → 110
  assert.equal(ritenutaPrevista(0), 0);
  assert.equal(ritenutaPrevista(-122), 0); // nota di credito
});

test("tendina dei metodi di pagamento: tutte le voci di BConsole, chiavi vecchie ancora valide", () => {
  const nomi = METODI_PAGAMENTO.map((m) => m.nome.toLowerCase());
  for (const v of ["assegno", "bollettino bancario", "bollettino di c/c postale", "bonifico", "compensazione", "contanti", "contanti presso tesoreria", "domiciliazione bancaria", "domiciliazione postale", "f24", "mav", "pagopa", "quietanza erario", "riba", "rid", "rid utenza", "rid veloce", "sepa direct debit", "sepa direct debit b2b", "sepa direct debit core", "trattenuta su somme già riscosse", "vaglia cambiario", "versamento contanti su c/c"])
    assert.ok(nomi.includes(v), v);
  for (const k of ["BONIFICO", "CARTA_CREDITO", "BANCOMAT", "ASSEGNO", "CONTANTI", "RIBA", "RID", "F24", "PAGOPA", "FINANZIAMENTO", "COMPENSAZIONE", "BONIFICO_DETRAZIONE"])
    assert.ok(METODI_PAGAMENTO.some((m) => m.chiave === k), k);
  assert.equal(new Set(METODI_PAGAMENTO.map((m) => m.chiave)).size, METODI_PAGAMENTO.length);
});

test("controlli sul pagamento", () => {
  assert.equal(controllaPagamento({ importo: 100, ritenuta: 0, commissione: 1.5, residuo: 100 }), null);
  assert.equal(controllaPagamento({ importo: 9900, ritenuta: 1100, commissione: 0, residuo: 11000 }), null);
  assert.match(controllaPagamento({ importo: 0, ritenuta: 0, commissione: 0, residuo: 100 })!, /importo/);
  assert.match(controllaPagamento({ importo: 101, ritenuta: 0, commissione: 0, residuo: 100 })!, /residuo/);
  assert.match(controllaPagamento({ importo: -5, ritenuta: 0, commissione: 0, residuo: 100 })!, /negativi/);
  assert.equal(nomeMetodo("BONIFICO_DETRAZIONE"), "Bonifico per detrazione (ritenuta 11%)");
  assert.ok(METODI_PAGAMENTO.some((m) => m.chiave === "BANCOMAT"));
});

test("la ritenuta conta come incassata nel residuo", () => {
  assert.equal(residuoScadenza({ importo: 11000, pagatoManuale: 0, ritenuta: 1100, abbinamenti: [{ importo: 9900 }] }), 0);
  assert.equal(residuoScadenza({ importo: 500, pagatoManuale: 100, abbinamenti: [{ importo: 150 }] }), 250);
});

test("estratto conto contro pagamenti registrati a mano: stesso importo, data vicina, una volta sola", () => {
  const manuali = [{ id: "a", data: d("2026-11-03"), importo: -500 }, { id: "b", data: d("2026-11-05"), importo: -500 }, { id: "c", data: d("2026-10-01"), importo: 1200 }];
  const righe = [{ data: d("2026-11-05"), importo: -500 }, { data: d("2026-11-04"), importo: -500 }, { data: d("2026-11-04"), importo: -500 }, { data: d("2026-11-04"), importo: 1200 }, { data: d("2026-11-04"), importo: -1.5 }];
  assert.deepEqual(confermePagamentiManuali(righe, manuali), ["b", "a", null, null, null]); // 1200 troppo lontano (34 giorni)
});

test("fatture di vendita: nomi, detrazione, sezionale, stato, rate", () => {
  assert.equal(nomeNorm("ROSSI  Mario"), nomeNorm("Mario Rossi"));
  assert.equal(nomeNorm("D'Àngelo Anna"), "ANGELO ANNA D");
  assert.ok(conDetrazione({ causale: "Lavori con detrazione fiscale 50% art. 16-bis TUIR", righe: [] }));
  assert.ok(conDetrazione({ causale: "", righe: [{ descrizione: "Fornitura infissi - Ecobonus 65%" }] as never }));
  assert.ok(!conDetrazione({ causale: "Acconto su ordine", righe: [] }));
  assert.equal(sezionaleDaNumero("123/FV"), "FV");
  assert.equal(sezionaleDaNumero("45/2026"), null);
  assert.equal(sezionaleDaNumero("416/2022/xml"), null);
  const oggi = d("2026-11-10");
  assert.equal(statoVendita({ totale: 100, tipoDocumento: "TD01" }, [{ importo: 100, residuo: 100, dataScadenza: d("2026-11-01"), stato: "APERTA" }], oggi), "SCADUTA");
  assert.equal(statoVendita({ totale: 100, tipoDocumento: "TD01" }, [{ importo: 100, residuo: 40, dataScadenza: d("2026-12-01"), stato: "PARZIALE" }], oggi), "PARZIALE");
  assert.equal(statoVendita({ totale: 100, tipoDocumento: "TD01" }, [{ importo: 100, residuo: 0, dataScadenza: d("2026-11-01"), stato: "PAGATA" }], oggi), "SALDATA");
  assert.equal(statoVendita({ totale: -50, tipoDocumento: "TD04" }, [], oggi), "NOTA_CREDITO");
  assert.deepEqual(rateIncasso({ scadenze: [], totale: 1220, data: "2026-11-02" }), [{ data: d("2026-11-02"), importo: 1220 }]);
  assert.equal(rateIncasso({ scadenze: [{ data: "2026-12-01", importo: 610, modalita: "MP05" }, { data: null, importo: 610, modalita: null }], totale: 1220, data: "2026-11-02" })[1].data.toISOString().slice(0, 10), "2026-11-02");
  assert.equal(chiaveVendita({ numero: "12 / A", data: "2026-05-01", tipoDocumento: "TD01", cedente: "IT10741080013" }), "V|10741080013|TD01|12/A|2026");
});
