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
  const r = await (await listino(new NextRequest("http://x/api/articoli/listino?famiglia=OUTDOOR&gruppo=RICAMBI%20VETRATE"))).json();
  const gu = r.articoli.find((a: { codice: string }) => a.codice === "2360");
  verifica(gu && gu.prezzoVendita === 24 && gu.um === "m" && gu.immagineUrl?.endsWith("2360.webp") && gu.descrizioneEstesa?.includes("maltempo"), "guarnizione 2360 nel pulsante «RICAMBI VETRATE» con prezzo, foto e descrizione", gu);
  const art = await prisma.articolo.findUnique({ where: { codice: "2360" }, include: { categoria: { include: { padre: { include: { padre: { include: { padre: true } } } } } } } });
  verifica(art?.costoAcquisto === 8.7 && art.categoria?.nome === "Scintilla" && art.categoria.padre?.nome === "Accessori e ricambi" && art.categoria.padre.padre?.nome === "VETRATE" && art.categoria.padre.padre.padre?.nome === "OUTDOOR", "in Articoli › OUTDOOR › VETRATE › Accessori e ricambi › Scintilla, costo 8,70", art?.categoria);

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

  console.log("4. Dalla prima versione: «Scorrevole parallelo» diventa «Scintilla», i ricambi di Ugo vanno nella «Brillante»");
  await prisma.articolo.deleteMany({});
  await prisma.configurazione.update({ where: { chiave: "ricambi_vetrate_versione" }, data: { valore: "2026-11-24" } });
  // com'era dopo la prima versione: Complementi vetrate › Accessori e ricambi › Scorrevole parallelo
  await prisma.categoriaArticolo.deleteMany({ where: { nome: { in: ["Accessori e ricambi"] } } });
  const cv = await prisma.categoriaArticolo.create({ data: { nome: "Complementi vetrate", famiglia: "OUTDOOR", gruppoListino: "VETRATE" } });
  await prisma.categoriaArticolo.create({ data: { nome: "Legni piallati", padreId: cv.id } });
  const ric = await prisma.categoriaArticolo.create({ data: { nome: "Accessori e ricambi", padreId: cv.id, famiglia: "OUTDOOR", gruppoListino: "VETRATE" } });
  const vecchia = await prisma.categoriaArticolo.create({ data: { nome: "Scorrevole parallelo", padreId: ric.id, famiglia: "OUTDOOR", gruppoListino: "VETRATE" } });
  const complementi = await prisma.categoriaArticolo.create({ data: { nome: "complementi", famiglia: "OUTDOOR", gruppoListino: "VETRATE" } });
  await prisma.articolo.create({ data: { codice: "2360", descrizione: "Guarnizione", categoriaId: vecchia.id, prezzoVendita: 24, um: "m" } });
  for (const [c, d, pz] of [["ART-00002", "CF TAPPO FOND C/GANCIO IX NERO VRT", 70], ["ART-00003", "CF GANCIO GRIGIO #PO# VTR", 20], ["ART-00004", "CF SUPP GANCIO ------ #PO# VTR", 25], ["ART-00005", "CF TAPPO FOND CENTR IX NERO VRT", 95]] as const)
    await prisma.articolo.create({ data: { codice: c, descrizione: d, categoriaId: complementi.id, prezzoVendita: pz } });
  await prisma.articolo.create({ data: { codice: "ALTRO-1", descrizione: "Non toccare", categoriaId: complementi.id } });
  const sp = await assicuraRicambiVetrate();
  const cat = async (codice: string) => (await prisma.articolo.findUnique({ where: { codice }, include: { categoria: true } }))?.categoria?.nome;
  verifica(sp.spostati === 5 && (await cat("2360")) === "Scintilla" && (await cat("ART-00002")) === "Brillante" && (await cat("ART-00005")) === "Brillante", "guarnizione nella Scintilla, i 4 ricambi CF nella Brillante", sp);
  verifica((await cat("ALTRO-1")) === "complementi" && !(await prisma.categoriaArticolo.findUnique({ where: { id: vecchia.id } })) && !(await prisma.categoriaArticolo.findUnique({ where: { id: ric.id } })), "gli altri articoli non si toccano, le vecchie cartelle vuote spariscono");
  const nuovaPos = await prisma.articolo.findUnique({ where: { codice: "ART-00003" }, include: { categoria: { include: { padre: { include: { padre: true } } } } } });
  verifica(nuovaPos?.categoria?.padre?.padre?.nome === "VETRATE" && !!(await prisma.categoriaArticolo.findUnique({ where: { id: cv.id } })), "le cartelle nuove stanno in VETRATE; «Complementi vetrate» resta per i legni");
  const r2 = await (await listino(new NextRequest("http://x/api/articoli/listino?famiglia=OUTDOOR&gruppo=RICAMBI%20VETRATE"))).json();
  verifica(r2.articoli.filter((a: { categoria: { nome: string } }) => a.categoria.nome === "Brillante").length === 4, "nell'offerta i 4 ricambi stanno sotto «Brillante»");
  const r3 = await (await listino(new NextRequest("http://x/api/articoli/listino?famiglia=OUTDOOR&gruppo=VETRATE"))).json();
  verifica(!r3.articoli.some((a: { codice: string }) => ["2360", "ART-00002"].includes(a.codice)), "sotto i modelli di VETRATE non compaiono più (stanno nel pulsante a parte)");

  console.log("5. Dalla versione «b»: «Vetrata scorrevole» / «Vetrata a pacchetto» diventano «Scintilla» / «Brillante»");
  await prisma.configurazione.update({ where: { chiave: "ricambi_vetrate_versione" }, data: { valore: "2026-11-24b" } });
  const sc = (await prisma.categoriaArticolo.findFirst({ where: { nome: "Scintilla" } }))!;
  const br = (await prisma.categoriaArticolo.findFirst({ where: { nome: "Brillante" } }))!;
  await prisma.categoriaArticolo.update({ where: { id: sc.id }, data: { nome: "Vetrata scorrevole", gruppoListino: "VETRATE" } });
  await prisma.categoriaArticolo.update({ where: { id: br.id }, data: { nome: "Vetrata a pacchetto", gruppoListino: "VETRATE" } });
  await assicuraRicambiVetrate();
  const nomi = (await prisma.categoriaArticolo.findMany({ where: { padreId: sc.padreId }, select: { nome: true, gruppoListino: true } }));
  verifica(nomi.length === 2 && nomi.every((n) => ["Scintilla", "Brillante"].includes(n.nome) && n.gruppoListino === "RICAMBI VETRATE") && (await cat("ART-00003")) === "Brillante" && (await cat("2360")) === "Scintilla", "cartelle rinominate, articoli al loro posto, nel pulsante «RICAMBI VETRATE»", nomi);

  console.log(`\n${ok} ok, ${ko} falliti`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
