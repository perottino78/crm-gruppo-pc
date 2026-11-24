// Collaudo: accessori e ricambi delle vetrate (guarnizione 2360) caricati in Articoli e aggiunti a un'offerta.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/ricambi-vetrate.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { GET as listino } from "../../src/app/api/articoli/listino/route";
import { aggiungiArticoloPreventivo } from "../../src/app/actions";
import { assicuraRicambiVetrate } from "../../src/lib/listini/ricambi-vetrate-server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };

async function main() {
  const tutte = (await prisma.$queryRawUnsafe<{ n: string }[]>(`SELECT tablename AS n FROM pg_tables WHERE schemaname='public'`)).map((r) => `"${r.n}"`);
  await prisma.$executeRawUnsafe(`TRUNCATE ${tutte.join(",")} CASCADE`);
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const cli = await prisma.cliente.create({ data: { nome: "Mario Rossi", brandId: pc.id } });
  const p = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: pc.id, commercialeId: ugo.id, aliquotaIva: 22 } });
  g.__utente = ugo;

  console.log("1. Caricamento nel listino OUTDOOR › VETRATE");
  const r = await (await listino(new NextRequest("http://x/api/articoli/listino?famiglia=OUTDOOR&gruppo=VETRATE"))).json();
  const gu = r.articoli.find((a: { codice: string }) => a.codice === "2360");
  verifica(gu && gu.prezzoVendita === 24 && gu.um === "m" && gu.immagineUrl?.endsWith("2360.webp") && gu.descrizioneEstesa?.includes("maltempo"), "guarnizione 2360 nel listino delle vetrate con prezzo, foto e descrizione", gu);
  const art = await prisma.articolo.findUnique({ where: { codice: "2360" }, include: { categoria: { include: { padre: { include: { padre: true } } } } } });
  verifica(art?.costoAcquisto === 8.7 && art.categoria?.nome === "Scorrevole parallelo" && art.categoria.padre?.nome === "Accessori e ricambi" && art.categoria.padre.padre?.nome === "Complementi vetrate", "in Articoli › Complementi vetrate › Accessori e ricambi › Scorrevole parallelo, costo 8,70", art?.categoria);

  console.log("2. Nell'offerta, al metro");
  await aggiungiArticoloPreventivo(fd({ preventivoId: p.id, articoloId: art!.id, quantita: "4,5" }));
  const riga = await prisma.rigaPreventivo.findFirst({ where: { preventivoId: p.id } });
  verifica(riga?.quantita === 1 && riga.prezzoUnitario === 108 && riga.testoLibero?.includes("4,5 mt × 24,00 €/mt") && riga.testoLibero.includes("maltempo"), "4,5 m → 108 € con metri e descrizione nel testo", riga);
  const tot = await prisma.preventivo.findUnique({ where: { id: p.id }, select: { totaleNetto: true } });
  verifica(tot?.totaleNetto === 108, "totale dell'offerta ricalcolato", tot);

  console.log("3. Se l'articolo c'è già (es. importato da BConsole) non si toccano i dati scritti a mano");
  await prisma.rigaPreventivo.deleteMany({});
  await prisma.articolo.deleteMany({});
  await prisma.configurazione.deleteMany({ where: { chiave: "ricambi_vetrate_versione" } });
  await prisma.articolo.create({ data: { codice: "2360", descrizione: "GUARNIZIONE A MANO", prezzoVendita: 30, metodoPrezzo: "MANUALE" } });
  const e = await assicuraRicambiVetrate();
  const dopo = await prisma.articolo.findUnique({ where: { codice: "2360" } });
  verifica(e.creati === 0 && e.completati === 1 && dopo?.prezzoVendita === 30 && dopo.descrizione === "GUARNIZIONE A MANO" && dopo.costoAcquisto === 8.7 && !!dopo.categoriaId, "nessun doppione: completa solo i campi vuoti (costo, categoria, foto)", dopo);
  verifica((await assicuraRicambiVetrate()).creati === 0 && (await prisma.articolo.count()) === 1, "rilanciato non rifà nulla");

  console.log(`\n${ok} ok, ${ko} falliti`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
