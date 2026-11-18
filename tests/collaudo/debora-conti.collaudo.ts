// Collaudo: richieste di Debora (18/11/2026) — flag «non generare un movimento in prima nota», stati di BConsole sulla scadenza,
// ritenuta, eliminazione/ripristino di una fattura di vendita registrata per errore, centro di costo, rinomina banca.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/debora-conti.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { registraPagamento } from "../../src/app/pagamenti-actions";
import { impostaStatoScadenza, azzeraPagatoManuale } from "../../src/app/amministrazione-actions";
import { eliminaFatturaVendita } from "../../src/app/vendite-actions";
import { salvaCentroCostoFattura } from "../../src/app/fatture-actions";
import { ripristina } from "../../src/lib/cestino";
import { ritenutaPrevista } from "../../src/lib/amministrazione/pagamenti";
import { GET as rinominaGet, POST as rinominaPost } from "../../src/app/api/admin/rinomina-banca/route";
import { NextRequest } from "next/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(d); } };
const scad = (id: string) => prisma.scadenza.findUniqueOrThrow({ where: { id }, include: { abbinamenti: true } });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "AbbinamentoScadenza","MovimentoFinanziario","ImportazioneEstratto","Scadenza","RigaFatturaAcquisto","FatturaAcquisto","FatturaVendita","Cestino","RegistroAmministrazione","Documento","Soggetto","ContoFinanziario","Utente" CASCADE');
  const debora = await prisma.utente.create({ data: { nome: "Debora Girodo", email: "debora@x.it", ruolo: "AMMINISTRATIVO" } });
  const bper = await prisma.contoFinanziario.create({ data: { nome: "Banca BPER", tipo: "BANCA", dataSaldoIniziale: new Date("2026-01-01T12:00:00Z") } });
  const carige = await prisma.contoFinanziario.create({ data: { nome: "Banca Carige", banca: "Carige", tipo: "BANCA", iban: "IT60X0542811101000000123456", dataSaldoIniziale: new Date("2026-01-01T12:00:00Z") } });
  g.__utente = debora;

  console.log("1. Ritenuta del bonifico parlante: lordo ÷ 1,22 × 11%");
  verifica(ritenutaPrevista(492.06) === 44.37, "492,06 € → 44,37 €");

  console.log("2. «non generare un movimento in prima nota»");
  const a = await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Saldo FT 2703", controparte: "ROSSI MARIO", importo: 492.06, dataScadenza: new Date("2026-11-16T12:00:00Z"), brand: "P&C" } });
  await dove(registraPagamento(fd({ scadenzaId: a.id, data: "2026-11-18", importo: "492,06", contoId: bper.id, metodo: "BONIFICO", senzaPrimaNota: "1", note: "SALDO FT n. 2703/00" })));
  const sa = await scad(a.id);
  verifica(sa.stato === "PAGATA" && sa.pagatoManuale === 492.06 && sa.metodoPagamento === "BONIFICO" && sa.bancaPagamento === "Banca BPER" && sa.abbinamenti.length === 0, "scadenza saldata senza abbinamenti", sa);
  verifica((await prisma.movimentoFinanziario.count({ where: { contoId: bper.id } })) === 0, "nessun movimento in prima nota");
  const b = await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Saldo FT 2704", controparte: "VERDI ANNA", importo: 1000, brand: "P&C" } });
  await dove(registraPagamento(fd({ scadenzaId: b.id, data: "2026-11-18", importo: "1000", contoId: bper.id, metodo: "BONIFICO" })));
  const mv = await prisma.movimentoFinanziario.findMany({ where: { contoId: bper.id } });
  verifica(mv.length === 1 && mv[0].importo === 1000 && mv[0].descrizione.includes("VERDI ANNA") && mv[0].data.toISOString().startsWith("2026-11-18"), "senza la spunta: entrata in prima nota (giorno, cliente, banca)", mv);
  await dove(azzeraPagatoManuale(fd({ id: a.id, motivo: "registrato due volte" })));
  const sa2 = await scad(a.id);
  verifica(sa2.stato === "APERTA" && sa2.pagatoManuale === 0, "pagamento segnato a mano tolto: scadenza di nuovo aperta", sa2);

  console.log("3. Stati come in BConsole");
  await dove(impostaStatoScadenza(fd({ id: a.id, stato: "Insoluta" })));
  let s = await scad(a.id);
  verifica(s.statoEtichetta === "Insoluta" && s.stato === "APERTA", "Insoluta: solo etichetta");
  await dove(impostaStatoScadenza(fd({ id: a.id, stato: "Saldata" })));
  s = await scad(a.id);
  verifica(s.stato === "PAGATA" && s.pagatoManuale === 492.06 && s.statoEtichetta === null, "Saldata: chiude la scadenza", s);
  const c = await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "x", controparte: "Y", importo: 200 } });
  await dove(impostaStatoScadenza(fd({ id: c.id, stato: "Rit. Fis Compensazione" })));
  s = await scad(c.id);
  verifica(s.stato === "PAGATA" && s.ritenuta === 200 && s.pagatoManuale === 0 && s.statoEtichetta === "Rit. Fis Compensazione", "Rit. Fis Compensazione: chiude con la ritenuta", s);
  const d = await prisma.scadenza.create({ data: { tipo: "PAGAMENTO", descrizione: "x", controparte: "Z", importo: 50 } });
  await dove(impostaStatoScadenza(fd({ id: d.id, stato: "Stornata" })));
  verifica((await scad(d.id)).stato === "ANNULLATA", "Stornata: annullata");
  await dove(impostaStatoScadenza(fd({ id: b.id, stato: "Stornata" })));
  verifica((await scad(b.id)).stato !== "ANNULLATA", "Stornata non vale se ha già pagamenti");

  console.log("4. Fattura di vendita registrata per errore: elimina con incassi e ripristina");
  const fv = await prisma.fatturaVendita.create({ data: { chiave: "X|1", numero: "40/Fo", data: new Date("2026-11-10T12:00:00Z"), clienteNome: "ROSSO ROBERTO", imponibile: 1000, iva: 100, totale: 1100, origine: "XML" } });
  const sv = await prisma.scadenza.create({ data: { tipo: "INCASSO", descrizione: "Fattura 40/Fo", controparte: "ROSSO ROBERTO", importo: 1100, origine: "FATTURA_VENDITA", fatturaVenditaId: fv.id, chiaveImport: `FV:${fv.id}:1` } });
  await dove(registraPagamento(fd({ scadenzaId: sv.id, data: "2026-11-12", importo: "1100", contoId: bper.id, metodo: "BONIFICO" })));
  verifica((await prisma.movimentoFinanziario.count({ where: { descrizione: { contains: "ROSSO ROBERTO" } } })) === 1, "incasso registrato");
  const r = await dove(eliminaFatturaVendita(fd({ id: fv.id })));
  verifica(r?.includes("eliminata") && !(await prisma.fatturaVendita.findUnique({ where: { id: fv.id } })), "fattura eliminata anche con l'incasso", r);
  verifica((await prisma.movimentoFinanziario.count({ where: { descrizione: { contains: "ROSSO ROBERTO" } } })) === 0, "l'incasso a mano è stato annullato dalla prima nota");
  const cest = await prisma.cestino.findFirst({ where: { tipo: "FATTURA_VENDITA", rifId: fv.id } });
  verifica(!!cest && cest.nome.includes("40/Fo"), "è nel cestino", cest?.nome);
  const rip = await ripristina(cest!.id, { nome: "Debora" });
  const fvR = await prisma.fatturaVendita.findUnique({ where: { id: fv.id } });
  const svR = await prisma.scadenza.findMany({ where: { fatturaVenditaId: fv.id } });
  verifica(rip.ok && !!fvR && svR.length === 1 && svR[0].stato === "APERTA" && svR[0].pagatoManuale === 0, "ripristinata con la sua scadenza, da incassare", { rip, svR });
  const crm = await prisma.fatturaVendita.create({ data: { chiave: "CRM|9", numero: "9/EST", data: new Date("2026-11-10T12:00:00Z"), clienteNome: "X", totale: 10, origine: "CRM" } });
  const r2 = await dove(eliminaFatturaVendita(fd({ id: crm.id })));
  verifica(r2?.includes("nota di credito") && !!(await prisma.fatturaVendita.findUnique({ where: { id: crm.id } })), "le fatture emesse dal CRM non si eliminano", r2);

  console.log("5. Centro di costo del fornitore sulla fattura");
  const forn = await prisma.soggetto.create({ data: { ragioneSociale: "IDROCENTRO SPA", ruoli: ["FORNITORE"] } });
  const fa = await prisma.fatturaAcquisto.create({ data: { chiave: "K1", fornitoreId: forn.id, fornitoreNome: forn.ragioneSociale, numero: "1", data: new Date("2026-11-01T12:00:00Z"), totale: 100 } });
  await salvaCentroCostoFattura(fd({ id: fa.id, centroCosto: "Serramenti", alFornitore: "on" }));
  verifica((await prisma.fatturaAcquisto.findUniqueOrThrow({ where: { id: fa.id } })).centroCosto === "Serramenti" && (await prisma.soggetto.findUniqueOrThrow({ where: { id: forn.id } })).centroCosto === "Serramenti", "centro di costo sulla fattura e sul fornitore");

  console.log("6. Banca Carige → Banca BPER P&C");
  const chiave = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
  const richiesta = (m: string) => new NextRequest("http://x/api/admin/rinomina-banca?da=carige&a=Banca%20BPER%20P%26C", { method: m, headers: { "x-seed-key": chiave } });
  let j = await (await rinominaGet(richiesta("GET"))).json();
  verifica(j.rinominate.length === 1 && (await prisma.contoFinanziario.findUniqueOrThrow({ where: { id: carige.id } })).nome === "Banca Carige", "prova: la trova ma non la cambia", j);
  j = await (await rinominaPost(richiesta("POST"))).json();
  const cf = await prisma.contoFinanziario.findUniqueOrThrow({ where: { id: carige.id } });
  verifica(cf.nome === "Banca BPER P&C" && cf.iban === "IT60X0542811101000000123456", "rinominata, l'IBAN resta", cf);

  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
