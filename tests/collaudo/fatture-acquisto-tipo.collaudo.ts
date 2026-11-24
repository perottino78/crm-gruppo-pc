// Collaudo: fatture d'acquisto (richieste di Ugo 24/11/2026) — Modifica del tipo (fattura spese con numero progressivo), correlazioni a ordine e
// progetto, pagamento scritto a mano in prima nota con commissione, fattura collegata dopo (registrata e pagata), modifica ed eliminazione del movimento.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/fatture-acquisto-tipo.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { modificaTipoFattura, aggiungiCorrelazioneFattura, togliCorrelazioneFattura, registraFatturaAcquisto } from "../../src/app/fatture-actions";
import { nuovoMovimento, collegaFatturaAMovimento, eliminaMovimentoManuale, modificaMovimentoManuale } from "../../src/app/amministrazione-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(d); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "CorrelazioneFatturaAcquisto","AbbinamentoScadenza","MovimentoFinanziario","Scadenza","RigaFatturaAcquisto","FatturaAcquisto","OrdineFornitore","CommessaEvento","TaskPratica","Commessa","RigaPreventivo","Preventivo","Cliente","Brand","RegistroAmministrazione","CostoManuale","Soggetto","ContoFinanziario","Utente" CASCADE');
  const u = await prisma.utente.create({ data: { nome: "Debora Girodo", email: "debora@x.it", ruolo: "AMMINISTRATIVO" } });
  g.__utente = u;
  const banca = await prisma.contoFinanziario.create({ data: { nome: "Banca BPER", tipo: "BANCA", dataSaldoIniziale: new Date("2026-01-01T12:00:00Z") } });
  const forn = await prisma.soggetto.create({ data: { ragioneSociale: "Lemonfour srl", ruoli: ["FORNITORE"] } });
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const cliente = await prisma.cliente.create({ data: { nome: "Rossi Mario", brandId: brand.id } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cliente.id, brandId: brand.id, commercialeId: u.id, oggetto: "x" } });
  const crea = (numero: string, tot: number, extra: object = {}) => prisma.fatturaAcquisto.create({
    data: { chiave: `k-${numero}-${Math.random()}`, fornitoreId: forn.id, fornitoreNome: forn.ragioneSociale, tipoDocumento: "PROFORMA", numero, data: new Date("2026-11-20T12:00:00Z"), imponibile: tot / 1.22, iva: tot - tot / 1.22, totale: tot, origine: "PDF",
      scadenzePreviste: [{ data: "2026-11-20", importo: tot, modalita: null }], righe: { create: [{ posizione: 1, descrizione: "Totale", importo: tot / 1.22 }] }, ...extra },
  });

  console.log("1. Modifica del tipo: Fattura spese con numero progressivo");
  const f1 = await crea("0", 512.4);
  await dove(modificaTipoFattura(fd({ id: f1.id, tipoDocumento: "SPESE", numero: "0", numeroFornitore: "5890/26" })));
  let r = await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: f1.id } });
  verifica(r.tipoDocumento === "SPESE" && r.numero === "1" && r.numeroFornitore === "5890/26", "prima fattura spese = n. 1, numero del fornitore conservato", r);
  const f2 = await crea("0", 100);
  await dove(modificaTipoFattura(fd({ id: f2.id, tipoDocumento: "SPESE", numero: "0" })));
  r = await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: f2.id } });
  verifica(r.numero === "2", "la seconda prende 2", r.numero);
  await dove(modificaTipoFattura(fd({ id: f2.id, tipoDocumento: "SPESE", numero: "2" })));
  r = await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: f2.id } });
  verifica(r.numero === "2", "salvare di nuovo non cambia il numero");
  const f3 = await crea("77", 61);
  await dove(modificaTipoFattura(fd({ id: f3.id, tipoDocumento: "TD04" })));
  const nc = await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: f3.id }, include: { righe: true } });
  verifica(nc.tipoDocumento === "TD04" && nc.totale < 0 && nc.righe[0].importo < 0, "nota di accredito: importi in negativo", nc);
  await dove(modificaTipoFattura(fd({ id: f3.id, tipoDocumento: "TD01" })));
  const bk = await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: f3.id } });
  verifica(bk.totale > 0, "tornando a fattura gli importi tornano positivi");
  await dove(modificaTipoFattura(fd({ id: f3.id, tipoDocumento: "ENTRATA_MERCE" })));
  verifica((await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: f3.id } })).tipoDocumento === "ENTRATA_MERCE", "entrata merce accettata");

  console.log("2. Registrazione e correlazioni");
  await dove(registraFatturaAcquisto(fd({ id: f1.id })));
  r = await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: f1.id } });
  verifica(r.stato === "REGISTRATA", "registrata dopo il salvataggio");
  const msgReg = await dove(modificaTipoFattura(fd({ id: f1.id, tipoDocumento: "TD01" })));
  verifica(msgReg?.includes("errore") && (await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: f1.id } })).tipoDocumento === "SPESE", "registrata: il tipo non si cambia senza riaprire", msgReg);
  const com = await prisma.commessa.create({ data: { numero: 12, anno: 2026, preventivoId: prev.id, clienteId: cliente.id, brandId: brand.id } });
  const ord = await prisma.ordineFornitore.create({ data: { numero: 5, anno: 2026, fornitoreId: forn.id, commessaId: com.id, stato: "INVIATO" } });
  await dove(aggiungiCorrelazioneFattura(fd({ id: f1.id, tipo: "ORDINE_FORNITORE", riferimentoId: ord.id })));
  await dove(aggiungiCorrelazioneFattura(fd({ id: f1.id, tipo: "PROGETTO", riferimentoId: com.id })));
  let cor = await prisma.correlazioneFatturaAcquisto.findMany({ where: { fatturaId: f1.id } });
  verifica(cor.length === 2 && cor.some((c) => c.descrizione.startsWith("Ordine fornitore 5/2026")) && cor.some((c) => c.descrizione.includes("Rossi Mario")), "ordine e progetto correlati", cor);
  await dove(aggiungiCorrelazioneFattura(fd({ id: f1.id, tipo: "PROGETTO", riferimentoId: com.id })));
  verifica((await prisma.correlazioneFatturaAcquisto.count({ where: { fatturaId: f1.id } })) === 2, "niente doppioni");
  await dove(togliCorrelazioneFattura(fd({ id: cor[0].id })));
  verifica((await prisma.correlazioneFatturaAcquisto.count({ where: { fatturaId: f1.id } })) === 1, "correlazione tolta");
  const f4 = await crea("9", 122);
  await dove(aggiungiCorrelazioneFattura(fd({ id: f4.id, tipo: "PROGETTO", riferimentoId: com.id })));
  verifica((await prisma.rigaFatturaAcquisto.findFirstOrThrow({ where: { fatturaId: f4.id } })).commessaId === com.id, "fattura da registrare: le righe vanno sul progetto (costi alla registrazione)");

  console.log("3. Pagamento a mano in prima nota con commissione, poi la fattura arriva");
  const f5 = await crea("A-1", 1220);
  await dove(nuovoMovimento(fd({ contoId: banca.id, data: "2026-11-21", verso: "uscita", importo: "1220", chi: "S:" + forn.id, chiNome: "Lemonfour srl", descrizione: "", metodo: "BONIFICO", commissione: "2,50" })));
  const mov = await prisma.movimentoFinanziario.findFirstOrThrow({ where: { importo: -1220 } });
  const com1 = await prisma.movimentoFinanziario.findFirst({ where: { commissioneDiId: mov.id } });
  verifica(mov.stato === "DA_ABBINARE" && mov.metodo === "BONIFICO" && mov.daConfermare && mov.descrizione === "Pagamento Lemonfour srl", "uscita a mano, da confermare con l'estratto", mov);
  verifica(com1?.importo === -2.5 && com1.categoria === "Commissioni e spese bancarie", "commissione come movimento a parte", com1);
  await dove(collegaFatturaAMovimento(fd({ movimentoId: mov.id, fatturaId: f5.id })));
  const f5d = await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: f5.id } });
  const m2 = await prisma.movimentoFinanziario.findUniqueOrThrow({ where: { id: mov.id }, include: { abbinamenti: { include: { scadenza: true } } } });
  verifica(f5d.stato === "REGISTRATA" && m2.stato === "ABBINATO" && m2.abbinamenti.length === 1 && m2.abbinamenti[0].scadenza.stato === "PAGATA", "fattura registrata e segnata pagata", { f: f5d.stato, m: m2.stato, a: m2.abbinamenti.map((a) => a.scadenza.stato) });

  console.log("4. Modifica ed eliminazione del movimento (la fattura si riapre)");
  await dove(modificaMovimentoManuale(fd({ id: mov.id, data: "2026-11-22", contoId: banca.id, importo: "1000", descrizione: "Pagamento Lemonfour srl", commissione: "3" })));
  let m3 = await prisma.movimentoFinanziario.findUniqueOrThrow({ where: { id: mov.id } });
  verifica(m3.importo === -1220, "importo sotto quanto già abbinato: rifiutato");
  await dove(modificaMovimentoManuale(fd({ id: mov.id, data: "2026-11-22", contoId: banca.id, importo: "1220", descrizione: "Pagamento Lemonfour srl", commissione: "3" })));
  m3 = await prisma.movimentoFinanziario.findUniqueOrThrow({ where: { id: mov.id } });
  const c3 = await prisma.movimentoFinanziario.findFirstOrThrow({ where: { commissioneDiId: mov.id } });
  verifica(m3.data.toISOString().startsWith("2026-11-22") && c3.importo === -3 && m3.stato === "ABBINATO", "data e commissione modificate", { m3, c3 });
  await dove(eliminaMovimentoManuale(fd({ id: mov.id })));
  verifica(!(await prisma.movimentoFinanziario.findUnique({ where: { id: mov.id } })) && (await prisma.movimentoFinanziario.count({ where: { commissioneDiId: mov.id } })) === 0, "movimento e commissione eliminati");
  const sc = await prisma.scadenza.findFirstOrThrow({ where: { chiaveImport: { startsWith: `FA:${f5.id}:` } }, include: { abbinamenti: true } });
  verifica(sc.stato !== "PAGATA" && sc.abbinamenti.length === 0, "la fattura è di nuovo da pagare", sc.stato);
  const conf = await prisma.movimentoFinanziario.create({ data: { contoId: banca.id, data: new Date("2026-11-10T12:00:00Z"), importo: -10, descrizione: "x", origine: "MANUALE", impronta: "T-1", stato: "DA_ABBINARE", confermatoIl: new Date() } });
  await dove(eliminaMovimentoManuale(fd({ id: conf.id })));
  verifica(!!(await prisma.movimentoFinanziario.findUnique({ where: { id: conf.id } })), "movimento già confermato dall'estratto: non si elimina");

  console.log(`\n${ok} ok, ${ko} errori`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main();
