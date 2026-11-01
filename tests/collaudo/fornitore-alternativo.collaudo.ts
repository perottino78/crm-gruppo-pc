// Collaudo: prima di inviare un ordine, una riga si può ordinare da un altro fornitore.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/fornitore-alternativo.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import * as A from "../../src/app/ordini-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
/** esegue un'azione e restituisce dove porta il redirect (null se non c'è) */
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(d.split(";")[2] ?? ""); } };
const lancia = async (p: Promise<unknown>) => { try { await p; return false; } catch (e) { return !(e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT"); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Documento","OrdineFornitore","RigaOrdine","CommessaEvento","Commessa","Preventivo","Cliente","Soggetto","Utente","Brand" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const laura = await prisma.utente.create({ data: { nome: "Laura Ordini", email: "laura@prova.it", ruolo: "AMMINISTRATIVO" } });
  const comm = await prisma.utente.create({ data: { nome: "Mario", email: "mario@prova.it", ruolo: "COMMERCIALE" } });
  const solito = await prisma.soggetto.create({ data: { ragioneSociale: "SOLITO SRL", ruoli: ["FORNITORE"], scontoFornitore: 40 } });
  const altro = await prisma.soggetto.create({ data: { ragioneSociale: "ALTRO SPA", ruoli: ["FORNITORE"], scontoFornitore: 35 } });
  const terzo = await prisma.soggetto.create({ data: { ragioneSociale: "TERZO SNC", ruoli: ["FORNITORE"] } });
  const cli = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", brandId: brand.id, comune: "Torino" } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: comm.id, oggetto: "Serramenti" } });
  const c = await prisma.commessa.create({ data: { numero: 9, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: brand.id } });
  const riga = (descrizione: string, extra: Record<string, unknown> = {}) => prisma.rigaOrdine.create({ data: { commessaId: c.id, rigaPreventivoId: `rp-${descrizione}`, descrizione, quantita: 2, fornitoreId: solito.id, fornitoreNome: solito.ragioneSociale, codiceFornitore: "S-1", prezzoAcquisto: 100, scontoAcquisto: 40, costoPrevisto: 120, ...extra } });
  const r1 = await riga("Finestra"), r2 = await riga("Persiana"), r3 = await riga("Zanzariera");

  g.__utente = laura;
  await dove(A.creaOrdineDaCommessa(fd({ commessaId: c.id, fornitoreId: solito.id })));
  const o1 = await prisma.ordineFornitore.findFirstOrThrow({ include: { righe: true } });
  await prisma.ordineFornitore.update({ where: { id: o1.id }, data: { consegnaRichiesta: new Date("2026-12-01T12:00:00Z"), note: "note solo per il solito" } });
  verifica(o1.righe.length === 3, "ordine al solito fornitore con 3 righe");

  console.log("1. Sposto una riga: nasce l'ordine al nuovo fornitore");
  g.__utente = comm;
  verifica(await lancia(A.spostaRigaAFornitore(fd({ rigaId: r1.id, nuovoFornitoreId: altro.id }))), "un commerciale non può spostare righe");
  g.__utente = laura;
  const d1 = await dove(A.spostaRigaAFornitore(fd({ rigaId: r1.id, nuovoFornitoreId: altro.id })));
  const o2 = await prisma.ordineFornitore.findFirstOrThrow({ where: { fornitoreId: altro.id } });
  const m1 = await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: r1.id } });
  verifica(m1.ordineFornitoreId === o2.id && m1.fornitoreId === altro.id && m1.fornitoreNome === "ALTRO SPA", "la riga è nell'ordine del nuovo fornitore", m1);
  verifica(m1.prezzoAcquisto === null && m1.codiceFornitore === null && m1.costoPrevisto === null && m1.scontoAcquisto === 35, "prezzo e codice del vecchio fornitore azzerati, sconto del nuovo", m1);
  verifica(m1.quantita === 2 && m1.commessaId === c.id, "quantità e commessa restano");
  verifica(o2.stato === "BOZZA" && o2.commessaId === c.id && o2.numero === o1.numero + 1 && o2.consegnaRichiesta?.toISOString().startsWith("2026-12-01") && o2.clienteFinale === o1.clienteFinale && o2.note === null, "nuova bozza con gli stessi dati (non le note per il vecchio fornitore)", o2);
  verifica(d1?.startsWith(`/ordini-fornitori/${o1.id}?ok=`) && d1.includes("ALTRO SPA"), "si resta sull'ordine di prima con il messaggio", d1);
  verifica(await prisma.rigaOrdine.count({ where: { ordineFornitoreId: o1.id } }) === 2, "nell'ordine di prima restano 2 righe");

  console.log("2. Seconda riga allo stesso fornitore: stessa bozza, nessun ordine in più");
  await dove(A.spostaRigaAFornitore(fd({ rigaId: r2.id, nuovoFornitoreId: altro.id })));
  verifica(await prisma.ordineFornitore.count() === 2 && await prisma.rigaOrdine.count({ where: { ordineFornitoreId: o2.id } }) === 2, "le due righe nello stesso ordine ad ALTRO SPA");
  const ev = await prisma.commessaEvento.findMany({ where: { commessaId: c.id, testo: { contains: "spostata" } } });
  verifica(ev.length === 2 && ev[0].testo.includes("SOLITO SRL") && ev[0].utenteNome === "Laura Ordini", "scritto nella storia della commessa", ev.map((e) => e.testo));

  console.log("3. L'ultima riga se ne va: la bozza vuota sparisce");
  const d3 = await dove(A.spostaRigaAFornitore(fd({ rigaId: r3.id, nuovoFornitoreId: terzo.id })));
  const o3 = await prisma.ordineFornitore.findFirstOrThrow({ where: { fornitoreId: terzo.id } });
  verifica(!(await prisma.ordineFornitore.findUnique({ where: { id: o1.id } })), "ordine vuoto al solito fornitore eliminato");
  verifica(d3?.startsWith(`/ordini-fornitori/${o3.id}?ok=`) && d3.includes("eliminato"), "si va al nuovo ordine", d3);
  verifica((await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: r3.id } })).scontoAcquisto === null, "fornitore senza sconto: sconto vuoto");

  console.log("4. Ordine già inviato: non si sposta");
  await prisma.ordineFornitore.update({ where: { id: o2.id }, data: { stato: "INVIATO" } });
  const d4 = await dove(A.spostaRigaAFornitore(fd({ rigaId: r1.id, nuovoFornitoreId: solito.id })));
  verifica(d4?.includes("errore=") && (await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: r1.id } })).ordineFornitoreId === o2.id, "rifiutato con spiegazione, la riga resta", d4);

  console.log("5. Ordine senza commessa: sempre un ordine nuovo");
  const libero = await prisma.ordineFornitore.create({ data: { numero: 50, anno: 2026, fornitoreId: solito.id } });
  const rl = await prisma.rigaOrdine.create({ data: { ordineFornitoreId: libero.id, descrizione: "Silicone", quantita: 10, fornitoreId: solito.id, fornitoreNome: "SOLITO SRL" } });
  await prisma.rigaOrdine.create({ data: { ordineFornitoreId: libero.id, descrizione: "Viti", quantita: 10, fornitoreId: solito.id, fornitoreNome: "SOLITO SRL" } });
  await prisma.ordineFornitore.create({ data: { numero: 51, anno: 2026, fornitoreId: terzo.id, stato: "BOZZA" } }); // bozza di un'altra pratica a scorta
  await dove(A.spostaRigaAFornitore(fd({ rigaId: rl.id, nuovoFornitoreId: terzo.id })));
  const dest = await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: (await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rl.id } })).ordineFornitoreId! } });
  verifica(dest.numero === 52 && dest.commessaId === null, "nuovo ordine 52, non mescolato con altre bozze", dest.numero);

  await prisma.$disconnect();
  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
