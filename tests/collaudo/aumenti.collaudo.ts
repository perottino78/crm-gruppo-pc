// Collaudo: aumento listino del fornitore su griglie, optional e articoli; poi annullamento.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/aumenti.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { applicaAumento, annullaAumento } from "../../src/app/listini-actions";
import { chiaveListino } from "../../src/lib/listini/aumenti";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d); } };
const prezzo = async (id: string) => (await prisma.prodotto.findUniqueOrThrow({ where: { id } })).prezzoBase;
const valore = async (id: string) => (await prisma.optional.findUniqueOrThrow({ where: { id } })).valore;

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "AumentoListino","StoricoPrezzoArticolo","Articolo","CategoriaArticolo","Optional","Prodotto","ModelloProdotto","Soggetto","Utente","Brand" CASCADE');
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@x.it", username: "uperottino", ruolo: "AMMINISTRATORE" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco", email: "m@x.it", username: "m", ruolo: "COMMERCIALE" } });
  const alias = await prisma.soggetto.create({ data: { ragioneSociale: "ALIAS SRL", ruoli: ["FORNITORE"] } });
  await prisma.modelloProdotto.create({ data: { brandId: pc.id, tipologia: "BRILLANTE", fornitoreId: alias.id } });
  const p1 = await prisma.prodotto.create({ data: { brandId: pc.id, tipologia: "BRILLANTE", colore: "B", larghezzaMm: 1000, altezzaMm: 2000, prezzoBase: 287.4 } });
  const p2 = await prisma.prodotto.create({ data: { brandId: pc.id, tipologia: "BRILLANTE", colore: "B", larghezzaMm: 2000, altezzaMm: 2000, prezzoBase: 500 } });
  const altro = await prisma.prodotto.create({ data: { brandId: pc.id, tipologia: "ZENITH", colore: "B", larghezzaMm: 1000, altezzaMm: 1000, prezzoBase: 100 } });
  const oFisso = await prisma.optional.create({ data: { brandId: pc.id, categoria: "Acc", nome: "Maniglia", tipoPrezzo: "FISSO", valore: 40, listino: "BRILLANTE" } });
  const oPerc = await prisma.optional.create({ data: { brandId: pc.id, categoria: "Acc", nome: "RAL", tipoPrezzo: "PERCENTUALE", valore: 10, listino: "BRILLANTE" } });
  const oGenerale = await prisma.optional.create({ data: { brandId: pc.id, categoria: "Posa", nome: "Smontaggio", tipoPrezzo: "FISSO", valore: 50, listino: null } });
  const cat = await prisma.categoriaArticolo.create({ data: { nome: "Ferramenta", metodoPrezzo: "RICARICO", valore: 2 } });
  const art = await prisma.articolo.create({ data: { codice: "A1", descrizione: "Cerniera", fornitoreId: alias.id, categoriaId: cat.id, prezzoListino: 10, sconti: "50", costoAcquisto: 5, prezzoVendita: 10 } });
  const artMano = await prisma.articolo.create({ data: { codice: "A2", descrizione: "Kit", fornitoreId: alias.id, costoAcquisto: 20, metodoPrezzo: "MANUALE", prezzoVendita: 55 } });

  console.log("1. Permessi e controlli");
  g.__utente = marco;
  verifica((await redirectA(applicaAumento(fd({ percentuale: "3,5", listino: chiaveListino(pc.id, "BRILLANTE") }))))?.includes("errore=permesso"), "il commerciale non può");
  g.__utente = ugo;
  verifica((await redirectA(applicaAumento(fd({ percentuale: "", listino: chiaveListino(pc.id, "BRILLANTE") }))))?.includes("errore=percentuale"), "senza percentuale si ferma");
  verifica(await prezzo(p1.id) === 287.4, "niente toccato");

  console.log("2. Aumento +3,5% del fornitore Alias");
  const dove = await redirectA(applicaAumento(fd({ percentuale: "3,5", arrotondamento: "CENTESIMI", listino: chiaveListino(pc.id, "BRILLANTE"), conOptional: "on", fornitoreArticoli: alias.id, nota: "lettera 01/11" })));
  verifica(dove?.includes("fatto="), "torna alla pagina con l'esito", dove);
  verifica(await prezzo(p1.id) === 297.46 && await prezzo(p2.id) === 517.5, "griglia BRILLANTE aumentata", [await prezzo(p1.id), await prezzo(p2.id)]);
  verifica(await prezzo(altro.id) === 100, "ZENITH (non selezionato) invariato");
  verifica(await valore(oFisso.id) === 41.4 && await valore(oPerc.id) === 10 && await valore(oGenerale.id) === 50, "optional fisso aumentato; percentuale e generale no");
  const a1 = await prisma.articolo.findUniqueOrThrow({ where: { id: art.id } });
  verifica(a1.prezzoListino === 10.35 && a1.costoAcquisto === 5.18 && a1.prezzoVendita === 10.36, "articolo: listino +3,5%, costo e vendita ricalcolati", a1);
  const a2 = await prisma.articolo.findUniqueOrThrow({ where: { id: artMano.id } });
  verifica(a2.costoAcquisto === 20.7 && a2.prezzoVendita === 55, "articolo a prezzo fisso: costo aumentato, vendita resta", a2);
  const aum = await prisma.aumentoListino.findFirstOrThrow();
  verifica(aum.prezzi === 2 && aum.optional === 1 && aum.articoli === 2 && aum.descrizione.startsWith("+3,5%"), "storico registrato", aum);
  verifica((await prisma.storicoPrezzoArticolo.count({ where: { origine: "AGGIORNAMENTO" } })) === 2, "storico prezzi degli articoli");

  console.log("3. Annulla");
  await redirectA(annullaAumento(fd({ id: aum.id })));
  verifica(await prezzo(p1.id) === 287.4 && await prezzo(p2.id) === 500 && await valore(oFisso.id) === 40, "griglia e optional tornati come prima");
  const b1 = await prisma.articolo.findUniqueOrThrow({ where: { id: art.id } });
  verifica(b1.prezzoListino === 10 && b1.costoAcquisto === 5 && b1.prezzoVendita === 10, "articolo tornato come prima", b1);
  verifica((await prisma.aumentoListino.findUniqueOrThrow({ where: { id: aum.id } })).annullatoDa === "Ugo Perottino", "segnato come annullato");
  await redirectA(annullaAumento(fd({ id: aum.id })));
  verifica(await prezzo(p1.id) === 287.4, "annullare due volte non cambia nulla");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
