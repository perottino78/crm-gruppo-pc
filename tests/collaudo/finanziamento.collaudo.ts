// Collaudo del pagamento con finanziamento (richiesta di Ugo 18/11/2026): cifra mista, offerta bloccata, tabelle modificabili da Impostazioni.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/finanziamento.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { salvaFinanziamento } from "../../src/app/actions";
import { salvaTabellaFinanziamento, eliminaTabellaFinanziamento, ripristinaTabelleFinanziamento } from "../../src/app/finanziamenti-actions";
import { leggiTabelleFinanziamento } from "../../src/lib/finanziamenti/server";
import { CONDIZIONI_CONSEGNA_FINANZIAMENTO } from "../../src/lib/condizioniOfferta";
import { calcolaFinanziamento, type SceltaFinanziamento } from "../../src/lib/finanziamenti/tabelle";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const x = (e as { digest?: string }).digest ?? ""; if (!x.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(x.split(";")[2] ?? ""); } };
const fin = async (id: string) => (await prisma.preventivo.findUniqueOrThrow({ where: { id }, select: { finanziamento: true } })).finanziamento as SceltaFinanziamento | null;

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Configurazione","Preventivo","Cliente","Utente","Brand" CASCADE');
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco", email: "m@x.it", username: "marco", ruolo: "COMMERCIALE" } });
  const cli = await prisma.cliente.create({ data: { nome: "Mario Rossi", brandId: pc.id } });
  const p = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: pc.id, commercialeId: ugo.id, totaleNetto: 10000, totaleIva: 2200 } });
  g.__utente = ugo;

  console.log("1. Cifra mista");
  await salvaFinanziamento(fd({ id: p.id, tabellaId: "ZERO_90", rate: "60", pagaSubito: "2.200,00" }));
  let f = await fin(p.id);
  verifica(f?.tabellaId === "ZERO_90" && f.rate === 60 && f.pagaSubito === 2200, "salva tabella, rate e cifra pagata subito (formato italiano)", f);
  const e = calcolaFinanziamento(f!, 12200);
  verifica(e.ok && e.importoFinanziato === 10000 && e.rata === 166.67 && e.costoPerNoi === 1573.01, "finanziato = totale − paga subito; rata e costo come il simulatore", e);
  const e2 = calcolaFinanziamento(f!, 13200);
  verifica(e2.ok && e2.anticipoDiretto === 2200 && e2.importoFinanziato === 11000, "se il totale cambia, la cifra pagata subito resta fissa", e2);
  await salvaFinanziamento(fd({ id: p.id, tabellaId: "ZERO_90" }));
  f = await fin(p.id);
  verifica(f?.rate === 60 && f.pagaSubito === 0, "senza dati: 60 rate e tutto finanziato", f);
  const err = await dove(salvaFinanziamento(fd({ id: p.id, tabellaId: "ZERO_90", rate: "60", pagaSubito: "12000" })));
  verifica(err?.includes("errore=") && (await fin(p.id))?.pagaSubito === 0, "finanziato sotto il minimo: rifiutato con avviso, resta quello di prima", err);
  await salvaFinanziamento(fd({ id: p.id, tabellaId: "PROMO_ZERO_10", rate: "60", pagaSubito: "0" }));
  verifica((await fin(p.id))?.rate === 10, "rate fuori tabella portate al valore consentito (10)");
  await salvaFinanziamento(fd({ id: p.id, tabellaId: "" }));
  verifica((await fin(p.id)) === null, "«Nessun finanziamento» toglie il piano");

  console.log("2. Offerta confermata = bloccata");
  await salvaFinanziamento(fd({ id: p.id, tabellaId: "TAN699_90", rate: "36", pagaSubito: "0" }));
  await prisma.preventivo.update({ where: { id: p.id }, data: { confermatoIl: new Date() } });
  await salvaFinanziamento(fd({ id: p.id, tabellaId: "ZERO_90", rate: "60", pagaSubito: "0" }));
  verifica((await fin(p.id))?.tabellaId === "TAN699_90", "dopo la conferma il finanziamento non cambia");

  console.log("3. Tabelle modificabili");
  verifica((await leggiTabelleFinanziamento()).length === 4, "di partenza le 4 tabelle del simulatore");
  verifica(!!(await dove(salvaTabellaFinanziamento(fd({ nome: "Mia tabella", importoMin: "1000", importoMax: "20000", rateDa: "12", rateA: "48", giorniPrimaRata: "90", tan: "5,5", tassoRendimento: "6,5" })))), "aggiunge una tabella");
  let tab = await leggiTabelleFinanziamento();
  const mia = tab.find((x) => x.nome === "Mia tabella");
  verifica(tab.length === 5 && mia?.tan === 5.5 && mia.rateA === 48, "nuova tabella salvata con i valori scritti", mia);
  await dove(salvaTabellaFinanziamento(fd({ id: mia!.id, nome: "Mia tabella 2", importoMin: "1000", importoMax: "20000", rateDa: "12", rateA: "48", giorniPrimaRata: "90", tan: "4", tassoRendimento: "6,5" })));
  verifica((await leggiTabelleFinanziamento()).find((x) => x.id === mia!.id)?.nome === "Mia tabella 2", "modifica una tabella esistente");
  const errT = await dove(salvaTabellaFinanziamento(fd({ nome: "Sbagliata", importoMin: "5000", importoMax: "1000", rateDa: "12", rateA: "48", giorniPrimaRata: "90", tan: "4", tassoRendimento: "6" })));
  verifica(errT?.includes("errore=") && (await leggiTabelleFinanziamento()).length === 5, "tabella con importi sbagliati rifiutata", errT);
  const nuovo = calcolaFinanziamento({ tabellaId: mia!.id, rate: 24, pagaSubito: 0 }, 5000, await leggiTabelleFinanziamento());
  verifica(nuovo.ok, "la tabella nuova si usa nei calcoli", nuovo);
  await dove(eliminaTabellaFinanziamento(fd({ id: mia!.id })));
  verifica((await leggiTabelleFinanziamento()).length === 4, "elimina la tabella");
  await dove(ripristinaTabelleFinanziamento());
  verifica((await prisma.configurazione.count({ where: { chiave: "finanziamento_tabelle" } })) === 0, "ripristina: tornano le tabelle del simulatore");

  verifica(CONDIZIONI_CONSEGNA_FINANZIAMENTO.includes("finanziamento approvato"), "con il finanziamento la consegna è «da finanziamento approvato»");

  console.log("4. Permessi");
  g.__utente = marco;
  const no = await dove(salvaTabellaFinanziamento(fd({ nome: "Abusiva", importoMin: "1000", importoMax: "2000", rateDa: "12", rateA: "24", giorniPrimaRata: "90", tan: "0", tassoRendimento: "0" })));
  const nTab = (await leggiTabelleFinanziamento()).length;
  verifica(no?.includes("permesso") && nTab === 4, "il commerciale non può cambiare le tabelle", [no, nTab]);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
