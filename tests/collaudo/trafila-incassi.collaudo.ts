// Collaudo: l'incasso registrato fa avanzare da solo la trafila dei task (acconto → ufficio successivo, saldo → posa).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/trafila-incassi.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { registraPagamento } from "../../src/app/pagamenti-actions";
import { avviaFaseFlusso, fattoTask } from "../../src/app/flusso-actions";
import { sincronizzaScadenzeCommesse } from "../../src/lib/amministrazione/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const aperti = (commessaId: string) => prisma.taskPratica.findMany({ where: { commessaId, completatoIl: null }, orderBy: { createdAt: "asc" } });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "AbbinamentoScadenza","MovimentoFinanziario","ContoFinanziario","Scadenza","FatturaVendita","TaskPratica","CommessaEvento","Commessa","Preventivo","FlussoFase","Utente","Brand","Cliente" CASCADE');
  const debora = await prisma.utente.create({ data: { nome: "Debora Girodo", email: "debora@x.it", username: "dgirodo", ruolo: "AMMINISTRATORE", ufficio: "AMMINISTRAZIONE" } });
  g.__utente = debora;
  const b = await prisma.brand.create({ data: { nome: "Purafonte" } });
  const banca = await prisma.contoFinanziario.create({ data: { nome: "Banca BPER", tipo: "BANCA", dataSaldoIniziale: new Date("2026-01-01T12:00:00Z") } });
  const cliente = await prisma.cliente.create({ data: { nome: "Giorgini Stefano", brandId: b.id } });
  const pr = await prisma.preventivo.create({ data: { clienteId: cliente.id, brandId: b.id, commercialeId: debora.id, stato: "ACCETTATO", totaleNetto: 2049.18 } });
  const c = await prisma.commessa.create({ data: { numero: 1, anno: 2026, preventivoId: pr.id, clienteId: cliente.id, brandId: b.id, totaleVendita: 2500, totaleImponibile: 2049.18, accontoImporto: 1000 } });
  await avviaFaseFlusso(c.id, "FATT_ACCONTO", "COMMERCIALE", "Collaudo");
  await sincronizzaScadenzeCommesse();
  const acconto = (await prisma.scadenza.findFirst({ where: { commessaId: c.id, origine: "COMMESSA_ACCONTO" } }))!;
  const saldo = (await prisma.scadenza.findFirst({ where: { commessaId: c.id, origine: "COMMESSA_SALDO" } }))!;
  verifica((await aperti(c.id)).map((t) => t.faseChiave).join() === "FATT_ACCONTO", "la pratica aspetta la fattura di acconto");

  console.log("1. Incasso parziale dell'acconto: la pratica va avanti");
  const r = await dove(registraPagamento(fd({ scadenzaId: acconto.id, data: "2026-11-03", importo: "500", contoId: banca.id, metodo: "BONIFICO", ritorno: "/amministrazione/scadenzario" })));
  verifica(r?.includes("Pratica avanzata") && r.includes("Emettere la fattura di acconto"), "il messaggio dice che la pratica è avanzata", r);
  const dopo = await aperti(c.id);
  verifica(dopo.length === 1 && dopo[0].faseChiave === "RILIEVO" && dopo[0].ufficio === "TECNICO", "chiusa «Fattura acconto», nuovo task all'ufficio tecnico (rilievo)", dopo.map((t) => t.faseChiave));
  const chiuso = (await prisma.taskPratica.findFirst({ where: { commessaId: c.id, faseChiave: "FATT_ACCONTO" } }))!;
  verifica(chiuso.completatoIl && chiuso.completatoDaNome === "Debora Girodo" && chiuso.descrizione?.includes("Acconto incassato il 03/11/2026"), "il task chiuso spiega perché, con chi e quando");
  verifica((await prisma.commessa.findUnique({ where: { id: c.id } }))?.accontoIncassato, "la commessa risulta con l'acconto incassato");

  console.log("2. Un secondo incasso non crea doppioni");
  await dove(registraPagamento(fd({ scadenzaId: acconto.id, data: "2026-11-04", importo: "500", contoId: banca.id, metodo: "BONIFICO" })));
  verifica((await prisma.taskPratica.count({ where: { commessaId: c.id, faseChiave: "RILIEVO" } })) === 1, "sempre un solo task di rilievo");

  console.log("3. Saldo incassato con la pratica alla «Fattura saldo»: parte la posa");
  for (let i = 0; i < 2; i++) { const t = (await aperti(c.id))[0]; await dove(fattoTask(fd({ taskId: t.id }))); }
  verifica((await aperti(c.id))[0]?.faseChiave === "FATT_SALDO", "rilievo e ordini fatti: si aspetta la fattura di saldo");
  await dove(registraPagamento(fd({ scadenzaId: saldo.id, data: "2026-11-20", importo: "1000", contoId: banca.id, metodo: "BONIFICO" })));
  verifica((await aperti(c.id))[0]?.faseChiave === "FATT_SALDO", "saldo pagato solo in parte: la fase resta aperta");
  await dove(registraPagamento(fd({ scadenzaId: saldo.id, data: "2026-11-21", importo: "500", contoId: banca.id, metodo: "BONIFICO" })));
  verifica((await aperti(c.id))[0]?.faseChiave === "POSA", "pagato tutto: chiusa «Fattura saldo», task alla posa");

  console.log("4. Incasso su una fattura di vendita agganciata alla pratica (come Giorgini da BConsole)");
  const pr2 = await prisma.preventivo.create({ data: { clienteId: cliente.id, brandId: b.id, commercialeId: debora.id, stato: "ACCETTATO" } });
  const c2 = await prisma.commessa.create({ data: { numero: 2, anno: 2026, preventivoId: pr2.id, clienteId: cliente.id, brandId: b.id, totaleVendita: 2500, accontoImporto: 1000, accontoTipo: "FINANZIAMENTO" } });
  await avviaFaseFlusso(c2.id, "FATT_ACCONTO", null, "Collaudo");
  const fv = await prisma.fatturaVendita.create({ data: { chiave: "BCV|9", numero: "500/FE/2026", data: new Date("2026-10-30"), clienteNome: "GIORGINI STEFANO", commessaId: c2.id, imponibile: 819.67, totale: 1000 } });
  const sf = await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Fattura 500/FE/2026", controparte: "Giorgini", importo: 1000, fatturaVenditaId: fv.id, origine: "FATTURA_VENDITA", chiaveImport: "BCV:9" } });
  await dove(registraPagamento(fd({ scadenzaId: sf.id, data: "2026-11-03", importo: "1000", contoId: banca.id, metodo: "BONIFICO" })));
  verifica((await aperti(c2.id))[0]?.faseChiave === "RILIEVO", "pagata la fattura della pratica: parte il task successivo");

  console.log("5. Pagamenti ai fornitori non toccano le pratiche");
  const sp = await prisma.scadenza.create({ data: { tipo: "PAGAMENTO", descrizione: "Fattura fornitore", controparte: "DIMAR", importo: 100, commessaId: null } });
  const prima = await prisma.taskPratica.count();
  await dove(registraPagamento(fd({ scadenzaId: sp.id, data: "2026-11-03", importo: "100", contoId: banca.id, metodo: "BONIFICO" })));
  verifica((await prisma.taskPratica.count()) === prima, "nessun task creato");
  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
}
main().catch((e) => { console.error(e); ko++; }).finally(async () => { await prisma.$disconnect(); process.exit(ko ? 1 : 0); });
