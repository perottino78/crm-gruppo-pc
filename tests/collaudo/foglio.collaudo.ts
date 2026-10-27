// Collaudo importazione prima nota da foglio, su database di PROVA.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/foglio.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { anteprimaFoglio, confermaFoglio } from "../../src/app/amministrazione-actions";
import { saldoConto } from "../../src/lib/amministrazione/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const admin = { id: "u1", nome: "Prova Admin", ruolo: "AMMINISTRATORE" };

const testa = '"DATA","MOVIMENTO","RIF. FATTURA","CLIENTE / FORNITORE","BANCA ENTRATA","BANCA USCITA","TOTALE","CASSA ENTRATA","CASSA USCITA"';
const righe = [
  '"31/12/25","Saldo al 31/12/25","","","€ 0,00","","€ 63.396,40","",""',
  '"08/01/26","Bonifico internet","101 del 22/12/25 - saldo","FORNITORE ALFA","","€ 1.128,50","€ 62.267,90","",""',
  '"08/01/26","Commissioni","","","","€ 0,70","€ 62.267,20","",""',
  '"08/01/26","Commissioni","","","","€ 0,70","€ 62.266,50","",""',
  '"20/01/26","Bonifico bancario","14 DEL 19/01/26","CLIENTE ROSSI","€ 2.000,00","","€ 64.266,50","1.819,67",""',
  '"20/01/26","Ritenuta fiscale","","","","€ 180,33","€ 64.086,17","",""',
  '"13/02/26","Bonifico bancario","stipendio gennaio","DIPENDENTE BIANCHI","","€ 1.728,00","€ 62.358,17","",""',
  '"16/02/26","F24 compensazione","","","","€ 2.358,17","€ 60.000,00","",""',
  '"06/08/26","AB n. 11111 del 06/08/26","acconto","FORNITORE BETA","","€ 1.302,64","","",""',
  '"31/12/26","AB n. 22222 del 31/12","202 del 17/06/26","FORNITORE GAMMA","","€ 2.659,35","","",""',
];
const foglio = (r: string[]) => [testa, ...r].join("\n");

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "AbbinamentoScadenza","MovimentoFinanziario","ImportazioneEstratto","Scadenza","ChiusuraMese","RegistroAmministrazione","ContoFinanziario" CASCADE');
  const conto = await prisma.contoFinanziario.create({ data: { nome: "Intesa P&C (prova)", tipo: "BANCA", saldoIniziale: 0, dataSaldoIniziale: new Date("2025-01-01T12:00:00Z"), divisione: "P&C" } });

  console.log("1. Permessi");
  g.__utente = { id: "u2", nome: "Commerciale", ruolo: "COMMERCIALE" };
  verifica(!(await anteprimaFoglio(conto.id, foglio(righe), "2025-12-31")).ok, "un commerciale non vede l'anteprima");
  verifica(!(await confermaFoglio(conto.id, foglio(righe), "f.csv", true, "2025-12-31")).ok, "un commerciale non può importare");
  verifica(await prisma.movimentoFinanziario.count() === 0, "nessun movimento scritto");
  g.__utente = admin;

  console.log("2. Anteprima");
  const a = await anteprimaFoglio(conto.id, foglio(righe), "2025-12-31");
  verifica(a.ok, "anteprima riuscita", a.errore);
  verifica(a.contoSenzaMovimenti && a.aperturaFoglio?.importo === 63396.4, "propone il saldo di apertura del foglio");
  verifica(a.nuovi === 7 && a.doppioni === 0, "7 movimenti nuovi", a);
  verifica(a.daAbbinare === 2, "2 restano da abbinare (fornitore e cliente)", a.categorie);
  verifica(a.programmate.length === 2 && a.programmate[0].passata && !a.programmate[1].passata, "2 righe senza totale: una da verificare, una programmata");
  verifica(a.saldoFinaleFoglio === 60000 && a.salti.length === 0, "foglio coerente, saldo finale 60.000");
  verifica(await prisma.movimentoFinanziario.count() === 0, "l'anteprima non scrive nulla");

  console.log("3. Conferma");
  const e = await confermaFoglio(conto.id, foglio(righe), "Prima nota Intesa 2026.csv", true, "2025-12-31");
  verifica(e.ok && e.quadratura === "OK", "importazione con quadratura OK", e);
  const c2 = await prisma.contoFinanziario.findUniqueOrThrow({ where: { id: conto.id } });
  verifica(c2.saldoIniziale === 63396.4 && c2.dataSaldoIniziale.toISOString().startsWith("2025-12-31"), "saldo iniziale del conto impostato dal foglio");
  const mov = await prisma.movimentoFinanziario.findMany({ where: { contoId: conto.id }, orderBy: [{ data: "asc" }, { importo: "asc" }] });
  verifica(mov.length === 7, "7 movimenti salvati (comprese le due commissioni identiche)");
  verifica(mov.every((m) => m.origine === "FOGLIO" && m.divisione === "P&C"), "origine FOGLIO e divisione ereditata dal conto");
  verifica(mov.filter((m) => m.categoria === "Commissioni e spese bancarie" && m.stato === "REGISTRATO").length === 2, "commissioni registrate da sole");
  verifica(mov.some((m) => m.categoria === "Ritenute su bonifici con detrazione" && m.importo === -180.33), "ritenuta registrata");
  verifica(mov.some((m) => m.categoria === "Stipendi e collaboratori") && mov.some((m) => m.categoria === "F24 / imposte e contributi"), "stipendio e F24 registrati");
  const rossi = mov.find((m) => m.descrizione.includes("ROSSI"));
  verifica(rossi?.stato === "DA_ABBINARE" && rossi.note === "Cassa entrata: 1.819,67", "incasso cliente da abbinare, netto dopo ritenuta come nota", rossi);
  verifica(Math.abs((await saldoConto(conto.id, new Date("2026-12-31T23:00:00Z"))) - 60000) < 0.005, "saldo CRM = 60.000,00");
  const sc = await prisma.scadenza.findMany({ where: { origine: "FOGLIO" }, orderBy: { dataScadenza: "asc" } });
  verifica(sc.length === 2 && sc.every((s) => s.tipo === "PAGAMENTO" && s.brand === "P&C"), "2 scadenze di pagamento create");
  verifica(sc[0]?.importo === 1302.64 && /verificare/.test(sc[0].note ?? ""), "riga passata senza totale marcata da verificare");
  verifica(sc[1].controparte === "FORNITORE GAMMA" && sc[1].dataScadenza?.toISOString().startsWith("2026-12-31") === true, "riba futura nello scadenzario");
  const imp = await prisma.importazioneEstratto.findFirstOrThrow();
  verifica(imp.saldoFinaleBanca === 60000 && imp.saldoCalcolato === 60000 && imp.nomeFile.startsWith("[Foglio]"), "storico importazioni con quadratura");
  verifica(await prisma.registroAmministrazione.count({ where: { azione: "Saldo iniziale dal foglio" } }) === 1, "cambio saldo iniziale nel registro");

  console.log("4. Reimportazione dello stesso foglio aggiornato");
  const piu = [...righe.slice(0, 8), '"20/10/26","Commissioni","","","","€ 1,00","€ 59.999,00","",""', ...righe.slice(8)];
  const a2 = await anteprimaFoglio(conto.id, foglio(piu), null);
  verifica(a2.nuovi === 1 && a2.doppioni === 7 && !a2.contoSenzaMovimenti, "solo la riga aggiunta è nuova", a2);
  verifica(a2.programmate.every((p) => p.giaPresente), "scadenze già presenti riconosciute");
  const e2 = await confermaFoglio(conto.id, foglio(piu), "Prima nota Intesa 2026.csv", false, null);
  verifica(e2.ok && e2.quadratura === "OK", "seconda importazione quadra", e2);
  verifica(await prisma.movimentoFinanziario.count() === 8 && await prisma.scadenza.count() === 2, "nessun doppione di movimenti o scadenze");
  const e3 = await confermaFoglio(conto.id, foglio(piu), "x.csv", true, "2025-12-31");
  verifica(!e3.ok, "il saldo iniziale non si cambia su un conto con movimenti");

  console.log("5. Blocchi");
  const rotto = foglio(piu.map((r) => r.replace('"€ 62.267,20"', '"€ 62.167,20"')));
  const a3 = await anteprimaFoglio(conto.id, rotto, null);
  verifica(a3.salti.length > 0, "salto nel totale segnalato in anteprima");
  verifica(!(await confermaFoglio(conto.id, rotto, "x.csv", false, null)).ok, "importazione bloccata con salti");
  await prisma.chiusuraMese.create({ data: { anno: 2026, mese: 10, chiusoDaNome: "Prova" } });
  const piu2 = [...piu.slice(0, 9), '"21/10/26","Commissioni","","","","€ 1,00","€ 59.998,00","",""', ...piu.slice(9)];
  const a4 = await anteprimaFoglio(conto.id, foglio(piu2), null);
  verifica(a4.nuovi === 0 && a4.inMesiChiusi === 1, "riga in mese chiuso esclusa", a4);
  verifica(!(await anteprimaFoglio(conto.id, "a,b\n1,2", null)).ok, "file non riconosciuto rifiutato");

  console.log("6. Due importazioni contemporanee su un conto nuovo");
  const c3 = await prisma.contoFinanziario.create({ data: { nome: "Carige (prova)", tipo: "BANCA", saldoIniziale: 0, dataSaldoIniziale: new Date("2025-01-01T12:00:00Z") } });
  const [x1, x2] = await Promise.all([
    confermaFoglio(c3.id, foglio(righe), "a.csv", false, null),
    confermaFoglio(c3.id, foglio(righe), "a.csv", false, null),
  ]);
  verifica(x1.ok && x2.ok, "entrambe terminano senza errori", [x1, x2]);
  verifica(await prisma.movimentoFinanziario.count({ where: { contoId: c3.id } }) === 7, "movimenti non duplicati");
  verifica(await prisma.scadenza.count({ where: { note: { contains: "a.csv" } } }) === 2, "scadenze non duplicate");

  console.log(`\nRisultato: ${ok} superati, ${ko} falliti`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
