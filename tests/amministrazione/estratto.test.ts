import { test } from "node:test";
import assert from "node:assert/strict";
import { leggiImporto, leggiData, leggiEstratto, improntePer, giorno } from "../../src/lib/amministrazione/estratto";
import { suggerisci, corrispondenzaNome } from "../../src/lib/amministrazione/abbinamento";

test("importi italiani e inglesi", () => {
  assert.equal(leggiImporto("1.234,56"), 1234.56);
  assert.equal(leggiImporto("-1.234,56"), -1234.56);
  assert.equal(leggiImporto("€ 2.000,00"), 2000);
  assert.equal(leggiImporto("1234.56"), 1234.56);
  assert.equal(leggiImporto("1,234.56"), 1234.56);
  assert.equal(leggiImporto("1.234"), 1234);
  assert.equal(leggiImporto("(75,30)"), -75.3);
  assert.equal(leggiImporto("12,00-"), -12);
  assert.equal(leggiImporto("+0,75"), 0.75);
  assert.equal(leggiImporto(""), null);
  assert.equal(leggiImporto("abc"), null);
  assert.equal(leggiImporto("1,2,3"), null);
});

test("date", () => {
  assert.equal(giorno(leggiData("26/10/2026")!), "2026-10-26");
  assert.equal(giorno(leggiData("26-10-26")!), "2026-10-26");
  assert.equal(giorno(leggiData("2026-10-26")!), "2026-10-26");
  assert.equal(giorno(leggiData("5.1.2026 10:30")!), "2026-01-05");
  assert.equal(leggiData("31/02/2026"), null);
  assert.equal(leggiData("Saldo"), null);
});

test("formato con importo unico, intestazione dopo righe di testata, saldo in fondo", () => {
  const csv = [
    "Banca Esempio - Estratto conto",
    "Conto;IT00X0000000000000000000000",
    "",
    "Data contabile;Data valuta;Descrizione;Importo;Divisa",
    "26/10/2026;26/10/2026;BONIFICO A VOSTRO FAVORE DA ROSSI MARIO SALDO FT 36/FO/2026;4.776,64;EUR",
    "23/10/2026;23/10/2026;COMMISSIONI;-0,75;EUR",
    "23/10/2026;23/10/2026;COMMISSIONI;-0,75;EUR",
    ";;Saldo finale;12.345,67;EUR",
  ].join("\r\n");
  const e = leggiEstratto(csv);
  assert.equal(e.ok, true);
  assert.equal(e.separatore, ";");
  assert.equal(e.rigaIntestazione, 4);
  assert.equal(e.colonne.data, "Data contabile");
  assert.equal(e.colonne.valuta, "Data valuta");
  assert.equal(e.righe.length, 3);
  assert.equal(e.righe[0].importo, 4776.64);
  assert.equal(e.righe[1].importo, -0.75);
  assert.equal(e.scartate.length, 1);
  assert.equal(e.scartate[0].motivo, "Riga di saldo/totale");
  // due commissioni identiche: impronte diverse; reimportando lo stesso file: impronte uguali
  const i1 = improntePer("c1", e.righe);
  const i2 = improntePer("c1", leggiEstratto(csv).righe);
  assert.notEqual(i1[1], i1[2]);
  assert.deepEqual(i1, i2);
  assert.notDeepEqual(i1, improntePer("c2", e.righe));
});

test("formato Dare/Avere con virgole e virgolette", () => {
  const csv = [
    '"Data operazione","Data valuta","Causale","Descrizione","Dare","Avere"',
    '"21/10/2026","21/10/2026","BONIFICO","Pagamento fattura n. 101, consulenza","1.229,12",""',
    '"20/10/2026","20/10/2026","ACCREDITO","Bonifico da Bianchi Luisa","","2.500,00"',
  ].join("\n");
  const e = leggiEstratto(csv);
  assert.equal(e.ok, true);
  assert.equal(e.separatore, ",");
  assert.equal(e.righe.length, 2);
  assert.equal(e.righe[0].importo, -1229.12);
  assert.equal(e.righe[0].descrizione, "BONIFICO · Pagamento fattura n. 101, consulenza");
  assert.equal(e.righe[1].importo, 2500);
  assert.equal(e.colonne.uscite, "Dare");
});

test("formato Entrate/Uscite con uscite negative e tabulazione", () => {
  const csv = "Data\tOperazione\tDettagli\tEntrate\tUscite\n05/10/2026\tAddebito\tRata finanziamento 41\t\t-2.830,69\n06/10/2026\tAccredito\tBonifico Verdi\t923,48\t\n";
  const e = leggiEstratto(csv);
  assert.equal(e.separatore, "\t");
  assert.equal(e.righe[0].importo, -2830.69);
  assert.equal(e.righe[1].importo, 923.48);
});

test("file non riconosciuto", () => {
  assert.equal(leggiEstratto("").ok, false);
  const e = leggiEstratto("pippo;pluto\n1;2\n");
  assert.equal(e.ok, false);
  assert.match(e.errore!, /intestazione/);
});

test("abbinamento: sicuro solo con importo esatto e nome", () => {
  const scad = [
    { id: "a", tipo: "INCASSO", controparte: "Rossi Mario", numeroDocumento: "36/FO/2026", descrizione: "Saldo", residuo: 4776.64, dataScadenza: null },
    { id: "b", tipo: "INCASSO", controparte: "Bianchi Luisa", numeroDocumento: null, descrizione: "Acconto", residuo: 4776.64, dataScadenza: null },
    { id: "c", tipo: "PAGAMENTO", controparte: "Rossi Mario", numeroDocumento: null, descrizione: "x", residuo: 4776.64, dataScadenza: null },
  ];
  const s = suggerisci({ importo: 4776.64, descrizione: "BONIFICO DA ROSSI MARIO SALDO FT 36/FO/2026", data: new Date() }, scad);
  assert.equal(s[0].scadenzaId, "a");
  assert.equal(s[0].sicuro, true);
  assert.equal(s[1].scadenzaId, "b");
  assert.equal(s[1].sicuro, false);
  assert.ok(!s.find((x) => x.scadenzaId === "c"), "un'entrata non va proposta per un pagamento");
  // solo importo, nessun nome: proposto ma non sicuro
  const s2 = suggerisci({ importo: 4776.64, descrizione: "BONIFICO", data: new Date() }, scad);
  assert.equal(s2.length, 2);
  assert.ok(s2.every((x) => !x.sicuro));
  // omonimi con stesso importo: nessuno è sicuro
  const omonimi = [scad[0], { ...scad[0], id: "d", numeroDocumento: null }];
  const s3 = suggerisci({ importo: 4776.64, descrizione: "BONIFICO DA ROSSI MARIO", data: new Date() }, omonimi);
  assert.ok(s3.every((x) => !x.sicuro));
  assert.equal(corrispondenzaNome("Edil Costruzioni S.R.L.", "BON. DA EDIL COSTRUZIONI SRL"), 1);

  // acconto e saldo con lo stesso importo: la parola nella causale decide, e il contrario non è mai automatico
  const commessa = [
    { id: "acc", tipo: "INCASSO", controparte: "Rossi Mario", numeroDocumento: null, descrizione: "Acconto", residuo: 1000, dataScadenza: null, origine: "COMMESSA_ACCONTO" },
    { id: "sal", tipo: "INCASSO", controparte: "Rossi Mario", numeroDocumento: null, descrizione: "Saldo", residuo: 1000, dataScadenza: null, origine: "COMMESSA_SALDO" },
  ];
  const s4 = suggerisci({ importo: 1000, descrizione: "BONIFICO DA ROSSI MARIO ACCONTO", data: new Date() }, commessa);
  assert.equal(s4[0].scadenzaId, "acc");
  assert.equal(s4[0].sicuro, true);
  const s5 = suggerisci({ importo: 1000, descrizione: "BONIFICO DA ROSSI MARIO ACCONTO", data: new Date() }, [commessa[1]]);
  assert.equal(s5.length, 1, "il saldo viene comunque proposto…");
  assert.equal(s5[0].sicuro, false, "…ma mai abbinato da solo");
});
