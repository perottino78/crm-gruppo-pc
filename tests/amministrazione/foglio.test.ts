import { test } from "node:test";
import assert from "node:assert/strict";
import { leggiPrimaNotaFoglio, categoriaDaFoglio, descrizioneRiga } from "../../src/lib/amministrazione/foglio";
import { leggiImporto, giorno } from "../../src/lib/amministrazione/estratto";

// Formato come esce da Google Fogli (intestazione unita su una riga)
const unaRiga = [
  '"DATA","MOVIMENTO","RIF. FATTURA","CLIENTE / FORNITORE","BANCA ENTRATA","BANCA USCITA","TOTALE","CASSA ENTRATA","CASSA USCITA",""',
  '"31/12/25","Saldo al 31/12/25","","","€ 0,00","","€ 63.396,40","","",""',
  '"08/01/26","Bonifico internet","101 del 22/12/25 - saldo","FORNITORE ALFA","","€ 1.128,50","€ 62.267,90","","",""',
  '"08/01/26","Commissioni","","","","€ 0,70","€ 62.267,20","","",""',
  '"20/01/26","Bonifico bancario","14 DEL 19/01/26","CLIENTE ROSSI","€ 2.000,00","","€ 64.267,20","1.819,67","",""',
  '"20/01/26","Ritenuta fiscale","","","","€ 180,33","€ 64.086,87","","",""',
  '"13/01/26","Bonifico bancario","stipendio dicembre","DIPENDENTE BIANCHI","","€ 1.728,00","€ 62.358,87","","",""',
  '"27/12/22","Bonifico Cessioni","215 del 29/06/22","CLIENTE VERDI","€ 7.900,00","","€ 70.258,87","","accreditato","€ 5.530,00"',
  '"27/12/22","Commissioni cessioni","1234567","BANCA","","€ 2.370,00","€ 67.888,87","","",""',
  '"14/02/26","Nota","","","","","€ 67.888,87","","",""',
  '"06/08/26","AB n. 1111111-01 del 06/08/26","acconto","FORNITORE BETA","","€ 1.302,64","","","",""',
  '"31/12/26","AB n. 2222222-02 del 31/12","202 del 17/06/26","FORNITORE GAMMA","","€ 2.659,35","","","",""',
  '"15/10/26","","","TELEFONIA","","-€ 15,84","","","",""',
].join("\n");

test("formato Google Fogli: saldo di apertura, movimenti, righe senza totale", () => {
  const e = leggiPrimaNotaFoglio(unaRiga);
  assert.equal(e.ok, true, e.errore);
  assert.equal(e.saldoIniziale?.importo, 63396.4);
  assert.equal(e.movimenti.length, 7);
  assert.equal(e.righeVuote, 1, "la riga 'Nota' con totale ma senza importo non è un movimento");
  assert.equal(e.salti.length, 0);
  assert.equal(e.saldoFinaleFoglio, 67888.87);
  assert.equal(e.saldoCalcolato, 67888.87, "saldo iniziale + movimenti = totale finale del foglio");
  assert.equal(e.movimenti[0].importo, -1128.5);
  assert.equal(e.movimenti[2].importo, 2000);
  assert.equal(e.movimenti[2].appunti, "Cassa entrata: 1.819,67", "il netto dopo ritenuta resta come appunto, non come cassa");
  assert.equal(e.movimenti[5].appunti, "Cassa uscita: accreditato · € 5.530,00");
  assert.equal(e.senzaTotale.length, 3);
  assert.equal(giorno(e.senzaTotale[1].data), "2026-12-31");
  assert.equal(e.senzaTotale[2].importo, 15.84, "-€ 15,84 in uscita = rettifica in entrata");
});

test("intestazione su due righe (download CSV) con colonna in più e apertura senza data", () => {
  const csv = [
    ',,,,BANCA,BANCA,,,CASSA,CASSA',
    'DATA,MOVIMENTO,RIF. FATTURA,CLIENTE / FORNITORE,ENTRATA,USCITA,TOTALE,INCASSATO CON DETRAZIONE,ENTRATA,USCITA',
    ',saldo al 31/12/24,,,,,"€ 73.152,70",,,',
    '02/01/26,Bonifico bancario,10 del 30/12/25,CLIENTE NERI,"€ 5.000,00",,"€ 78.152,70","€ 4.545,45",,',
    '02/01/26,Addebito su cc,,ENEL,,"€ 152,70","€ 78.000,00",,,',
  ].join("\n");
  const e = leggiPrimaNotaFoglio(csv);
  assert.equal(e.ok, true, e.errore);
  assert.equal(e.saldoIniziale?.importo, 73152.7);
  assert.equal(e.saldoIniziale?.data, null);
  assert.equal(e.movimenti.length, 2);
  assert.equal(e.movimenti[0].appunti, "Incassato con detrazione: € 4.545,45");
  assert.equal(e.saldoCalcolato, 78000);
});

test("salto nel totale progressivo segnalato", () => {
  const e = leggiPrimaNotaFoglio(unaRiga.replace('"€ 62.267,20"', '"€ 62.167,20"'));
  assert.equal(e.salti.length, 2);
  assert.equal(e.salti[0].differenza, -100);
});

test("file non riconosciuto", () => {
  assert.equal(leggiPrimaNotaFoglio("").ok, false);
  assert.match(leggiPrimaNotaFoglio("a,b\n1,2").errore!, /intestazione/);
});

test("classificazione automatica dai tipi di movimento", () => {
  const c = (tipo: string, importo = -1, rif = "") => categoriaDaFoglio({ tipo, rif, controparte: "", importo });
  assert.equal(c("Commissioni"), "Commissioni e spese bancarie");
  assert.equal(c("Commissione"), "Commissioni e spese bancarie");
  assert.equal(c("Ritenuta fiscale"), "Ritenute su bonifici con detrazione");
  assert.equal(c("Bonifico Cessioni", 7900), "Incassi da cessione crediti");
  assert.equal(c("Bonifico x cessione", 7900), "Incassi da cessione crediti");
  assert.equal(c("Commissioni x cessione"), "Costi e commissioni per cessioni");
  assert.equal(c("Commissioni cessioni"), "Costi e commissioni per cessioni");
  assert.equal(c("F24 compensazione"), "F24 / imposte e contributi");
  assert.equal(c("Pagamento pago pa"), "F24 / imposte e contributi");
  assert.equal(c("Pagamento PagoPA"), "F24 / imposte e contributi");
  assert.equal(c("Bonifico bancario", -1728, "stipendio dicembre"), "Stipendi e collaboratori");
  assert.equal(c("Bonifico bancario", -500, "fattura 12"), null, "i pagamenti a fornitori restano da abbinare");
  assert.equal(c("Pagamento paypal"), null);
  assert.equal(descrizioneRiga({ tipo: "Bonifico bancario", rif: "14 DEL 19/01/26", controparte: "CLIENTE ROSSI" }), "Bonifico bancario · CLIENTE ROSSI · 14 DEL 19/01/26");
  assert.equal(leggiImporto("-€ 15,84"), -15.84);
});
