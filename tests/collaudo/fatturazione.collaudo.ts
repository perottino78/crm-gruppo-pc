// Collaudo: fatturazione (ufficio Giorgia) — fatture di prova e vere, acconto e saldo da commessa, DDT di uscita e fattura differita,
// numerazione che continua da BConsole, nota di credito, PDF e XML. Su database LOCALE.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/fatturazione.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import * as A from "../../src/app/fatturazione-actions";
import { datiPdfFattura, datiPdfDdt, puoFatturazione } from "../../src/lib/fatturazione/server";
import { pdfFattura, pdfDdt } from "../../src/lib/fatturazione/pdf";
import { leggiFatturaPA } from "../../src/lib/fatture/fatturapa";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
const redirectA = async (p: Promise<unknown>): Promise<string> => {
  try { await p; return ""; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (d.startsWith("NEXT_REDIRECT")) return decodeURIComponent(d.split(";")[2] ?? ""); throw e; }
};
const idDa = (url: string) => url.split("/").pop()!.split("?")[0];

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaFatturaEmessa","FatturaEmessa","RigaDdtUscita","DdtUscita","Scadenza","FatturaVendita","Configurazione","RegistroAmministrazione","RigaOptional","RigaPreventivo","Commessa","Preventivo","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const giorgia = await prisma.utente.create({ data: { nome: "Giorgia Rosa Clot", email: "g@x.it", username: "giorgia", ruolo: "AMMINISTRATIVO", ufficio: "FATTURAZIONE" } });
  const comm = await prisma.utente.create({ data: { nome: "Marco Venditore", email: "m@x.it", username: "marco", ruolo: "COMMERCIALE" } });
  verifica(puoFatturazione(giorgia) && !puoFatturazione(comm), "Giorgia fattura, il commerciale no");
  g.__utente = giorgia;

  const cli = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", brandId: b.id, tipoAnagrafica: "PERSONA_FISICA", nomePersona: "Mario", cognome: "Rossi", codiceFiscale: "RSSMRA80A01L219X", indirizzo: "Via Roma 1", cap: "10100", comune: "Torino", provincia: "TO", email: "mario@x.it" } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: b.id, commercialeId: comm.id, oggetto: "Serramenti", numeroOfferta: 1, totaleNetto: 10000, totaleIva: 1000, aliquotaIva: 10 } });
  await prisma.rigaPreventivo.create({ data: { preventivoId: prev.id, testoLibero: "Finestre in PVC bianco", quantita: 4, prezzoUnitario: 2000 } });
  await prisma.rigaPreventivo.create({ data: { preventivoId: prev.id, testoLibero: "Posa in opera", quantita: 1, prezzoUnitario: 2000 } });
  const c = await prisma.commessa.create({ data: { numero: 12, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: b.id, totaleVendita: 11000, totaleImponibile: 10000, accontoImporto: 5500 } });
  // una fattura di BConsole già caricata: la numerazione deve continuare da lì
  await prisma.fatturaVendita.create({ data: { chiave: "bc1", numero: "518/FE/2026", data: new Date("2026-11-08T12:00:00Z"), clienteNome: "ALTRO", origine: "XML", totale: 100 } });

  // 1) modalità PROVA (predefinita): acconto dalla commessa
  const u1 = await redirectA(A.creaFattura(fd({ commessaId: c.id, tipo: "ACCONTO", data: "2026-11-09" })));
  const accId = idDa(u1);
  let acc = await prisma.fatturaEmessa.findUniqueOrThrow({ where: { id: accId }, include: { righe: true } });
  verifica(acc.stato === "BOZZA" && acc.righe.length === 1 && acc.righe[0].prezzo === 5000 && acc.righe[0].aliquota === 10 && acc.totale === 5500, "acconto dalla commessa: 5.000 + IVA 10% = 5.500", acc);
  verifica(acc.persona && acc.cognome === "Rossi" && acc.codiceFiscale === "RSSMRA80A01L219X" && acc.sezionale === "PC", "dati del cliente copiati, sezionale P&C");
  await redirectA(A.emettiFattura(fd({ id: accId })));
  acc = await prisma.fatturaEmessa.findUniqueOrThrow({ where: { id: accId }, include: { righe: true } });
  verifica(acc.stato === "PROVA" && acc.numero === "PROVA 1/FE/2026" && !acc.fatturaVenditaId, "in prova: numero «PROVA 1/FE/2026», niente fattura di vendita", acc.numero);
  verifica((await prisma.scadenza.count()) === 0 && (await prisma.fatturaVendita.count()) === 1, "in prova: niente scadenze né vendite nuove");
  const [x] = leggiFatturaPA(acc.xml!);
  verifica(x.tipoDocumento === "TD02" && x.totale === 5500 && x.cliente.denominazione === "Mario Rossi", "XML di prova leggibile (TD02, 5.500 €)");
  const pdf = pdfFattura((await datiPdfFattura(accId))!.dati);
  verifica(pdf.length > 1500 && Buffer.from(pdf).toString("latin1").includes("NON VALIDA"), "PDF della fattura di prova con la scritta «non valida»");
  const errE = await redirectA(A.salvaRigheFattura(fd({ id: accId, nuova_descrizione: "x" })));
  verifica(errE.includes("errore="), "una fattura emessa non si modifica più");
  await redirectA(A.eliminaFattura(fd({ id: accId })));
  verifica((await prisma.fatturaEmessa.count()) === 0, "la fattura di prova si elimina");

  // 2) l'amministratore accende l'emissione vera e indica l'ultimo numero di BConsole del DDT
  g.__utente = ugo;
  await redirectA(A.salvaImpostazioniFatturazione(fd({ anno: "2026", reale: "on", ultimo_ddt: "551" })));
  g.__utente = giorgia;
  const accV = idDa(await redirectA(A.creaFattura(fd({ commessaId: c.id, tipo: "ACCONTO", data: "2026-11-09" }))));
  await redirectA(A.emettiFattura(fd({ id: accV })));
  const accE = await prisma.fatturaEmessa.findUniqueOrThrow({ where: { id: accV } });
  verifica(accE.stato === "EMESSA" && accE.numero === "519/FE/2026", "vera: continua da BConsole → 519/FE/2026", accE.numero);
  const fv = await prisma.fatturaVendita.findUniqueOrThrow({ where: { id: accE.fatturaVenditaId! } });
  verifica(fv.origine === "CRM" && fv.tipoDocumento === "TD02" && fv.totale === 5500 && fv.commessaId === c.id && fv.clienteId === cli.id, "nelle fatture di vendita, collegata a cliente e commessa", fv);
  const sc = await prisma.scadenza.findMany({ where: { fatturaVenditaId: fv.id } });
  verifica(sc.length === 1 && sc[0].importo === 5500 && sc[0].tipo === "INCASSO", "scadenza di incasso creata", sc);

  // 3) saldo: righe dell'offerta meno l'acconto
  const saldoId = idDa(await redirectA(A.creaFattura(fd({ commessaId: c.id, tipo: "SALDO", data: "2026-11-20" }))));
  const saldo = await prisma.fatturaEmessa.findUniqueOrThrow({ where: { id: saldoId }, include: { righe: { orderBy: { posizione: "asc" } } } });
  verifica(saldo.righe.length === 3 && saldo.righe[2].prezzo === -5000 && saldo.righe[2].descrizione.includes("519/FE/2026") && saldo.imponibile === 5000 && saldo.totale === 5500, "saldo: 10.000 di offerta − 5.000 di acconto = 5.500 IVA compresa", saldo.righe.map((r) => [r.descrizione, r.prezzo]));
  // controlli: senza codice fiscale non si emette
  await prisma.fatturaEmessa.update({ where: { id: saldoId }, data: { codiceFiscale: null } });
  const errCf = await redirectA(A.emettiFattura(fd({ id: saldoId })));
  verifica(errCf.includes("codice fiscale"), "senza codice fiscale/partita IVA non si emette", errCf);
  await prisma.fatturaEmessa.update({ where: { id: saldoId }, data: { codiceFiscale: "RSSMRA80A01L219X" } });
  await redirectA(A.emettiFattura(fd({ id: saldoId })));
  verifica((await prisma.fatturaEmessa.findUniqueOrThrow({ where: { id: saldoId } })).numero === "520/FE/2026", "il saldo prende 520/FE/2026");

  // 4) DDT di uscita dalla commessa, conferma (continua da 551) e fattura differita
  const ddtId = idDa(await redirectA(A.creaDdt(fd({ commessaId: c.id, data: "2026-11-10" }))));
  let ddt = await prisma.ddtUscita.findUniqueOrThrow({ where: { id: ddtId }, include: { righe: true } });
  verifica(ddt.stato === "BOZZA" && ddt.righe.length === 2 && ddt.causale === "Vendita merce", "DDT in bozza con le voci dell'offerta");
  await redirectA(A.salvaTestataDdt(fd({ id: ddtId, data: "2026-11-10", causale: "Vendita merce", trasportoACura: "VETTORE", vettore: "BRT", colli: "3", pesoLordo: "120,5", aspettoBeni: "Pallet", porto: "Porto franco", inizioTrasporto: "2026-11-10T08:30" })));
  await redirectA(A.confermaDdt(fd({ id: ddtId })));
  ddt = await prisma.ddtUscita.findUniqueOrThrow({ where: { id: ddtId }, include: { righe: true } });
  verifica(ddt.numero === 552 && !ddt.prova && ddt.stato === "DA_FATTURARE" && ddt.colli === 3 && ddt.pesoLordo === 120.5 && ddt.vettore === "BRT", "DDT 552/2026 da fatturare, con i dati di trasporto", ddt);
  verifica(ddt.inizioTrasporto?.toISOString() === "2026-11-10T07:30:00.000Z", "inizio trasporto in ora di Roma", ddt.inizioTrasporto);
  const pdfD = Buffer.from(pdfDdt((await datiPdfDdt(ddtId))!.dati)).toString("latin1");
  verifica(pdfD.includes("552/2026") && pdfD.includes("BRT") && !pdfD.includes("2.000,00"), "PDF del DDT con numero e vettore, senza prezzi");
  const ddt2Id = idDa(await redirectA(A.creaDdt(fd({ clienteId: cli.id, data: "2026-11-11" }))));
  await redirectA(A.salvaRigheDdt(fd({ id: ddt2Id, nuova_descrizione: "Zanzariera", nuova_quantita: "2", nuova_prezzo: "150", nuova_iva: "22" })));
  await redirectA(A.confermaDdt(fd({ id: ddt2Id })));
  const altro = await prisma.cliente.create({ data: { nome: "BIANCHI SRL", brandId: b.id, piva: "01234567890", indirizzo: "Via Po 2", cap: "10121", comune: "Torino", provincia: "TO" } });
  const ddt3Id = idDa(await redirectA(A.creaDdt(fd({ clienteId: altro.id }))));
  await redirectA(A.salvaRigheDdt(fd({ id: ddt3Id, nuova_descrizione: "Tenda", nuova_prezzo: "100" })));
  await redirectA(A.confermaDdt(fd({ id: ddt3Id })));
  const errMix = await redirectA(A.fatturaDaDdt(fd({ ddtId: [ddtId, ddt3Id], ritorno: "/fatturazione" })));
  verifica(errMix.includes("clienti diversi"), "DDT di clienti diversi: rifiutato");
  const difId = idDa(await redirectA(A.fatturaDaDdt(fd({ ddtId: [ddtId, ddt2Id], ritorno: "/fatturazione" }))));
  const dif = await prisma.fatturaEmessa.findUniqueOrThrow({ where: { id: difId }, include: { righe: true, ddt: true } });
  verifica(dif.tipo === "DIFFERITA" && dif.ddt.length === 2 && dif.righe.filter((r) => r.rigaDdtId).length === 3 && dif.imponibile === 10300, "fattura differita da 2 DDT: 3 righe di merce + riferimenti", { imp: dif.imponibile, righe: dif.righe.length });
  await redirectA(A.emettiFattura(fd({ id: difId })));
  const difE = await prisma.fatturaEmessa.findUniqueOrThrow({ where: { id: difId } });
  const [xd] = leggiFatturaPA(difE.xml!);
  verifica(difE.numero === "521/FE/2026" && xd.tipoDocumento === "TD24" && xd.ddt.map((d) => d.numero).join(",") === "552/2026,553/2026", "differita 521/FE/2026 (TD24) con i DDT citati nell'XML", xd.ddt);
  const statiDdt = await prisma.ddtUscita.findMany({ where: { id: { in: [ddtId, ddt2Id] } }, select: { stato: true } });
  verifica(statiDdt.every((d) => d.stato === "FATTURATO"), "i DDT diventano «Fatturato»");
  const errDdt = await redirectA(A.salvaRigheDdt(fd({ id: ddtId, nuova_descrizione: "x" })));
  verifica(errDdt.includes("errore="), "un DDT fatturato non si modifica");

  // 5) nota di credito che storna il saldo
  const ncId = idDa(await redirectA(A.creaNotaCredito(fd({ id: saldoId }))));
  await redirectA(A.emettiFattura(fd({ id: ncId })));
  const nc = await prisma.fatturaEmessa.findUniqueOrThrow({ where: { id: ncId } });
  const fvNc = await prisma.fatturaVendita.findUniqueOrThrow({ where: { id: nc.fatturaVenditaId! } });
  verifica(nc.numero === "522/FE/2026" && fvNc.tipoDocumento === "TD04" && fvNc.totale === -5500 && (await prisma.scadenza.count({ where: { fatturaVenditaId: fvNc.id } })) === 0, "nota di credito 522/FE/2026: in negativo nelle vendite, senza scadenze", fvNc);
  verifica(leggiFatturaPA(nc.xml!)[0].notaCredito && nc.xml!.includes("<IdDocumento>520/FE/2026</IdDocumento>"), "XML della nota di credito con la fattura stornata");
  const errDel = await redirectA(A.eliminaFattura(fd({ id: saldoId })));
  verifica(errDel.includes("nota di credito"), "una fattura vera non si elimina");

  // 6) sezionale diverso: numerazione propria; proforma senza numero fiscale
  const foId = idDa(await redirectA(A.creaFattura(fd({ clienteId: altro.id, tipo: "FATTURA", sezionale: "FO" }))));
  await redirectA(A.salvaRigheFattura(fd({ id: foId, nuova_descrizione: "Impianto fotovoltaico", nuova_prezzo: "8000", nuova_iva: "10" })));
  await redirectA(A.emettiFattura(fd({ id: foId })));
  verifica((await prisma.fatturaEmessa.findUniqueOrThrow({ where: { id: foId } })).numero === "1/FO/2026", "sezionale Fotovoltaico: 1/FO/2026");
  const pfId = idDa(await redirectA(A.creaFattura(fd({ clienteId: altro.id, tipo: "PROFORMA" }))));
  await redirectA(A.salvaRigheFattura(fd({ id: pfId, nuova_descrizione: "Anticipo", nuova_prezzo: "1000" })));
  await redirectA(A.emettiFattura(fd({ id: pfId })));
  const pf = await prisma.fatturaEmessa.findUniqueOrThrow({ where: { id: pfId } });
  verifica(pf.numero === `PROFORMA 1/${new Date().getFullYear()}` && !pf.xml && !pf.fatturaVenditaId, "proforma: numero suo, niente XML né vendite", pf.numero);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
