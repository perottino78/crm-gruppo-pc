// Collaudo: optional dei serramenti allineati da soli (Zenith nuovo, voci in più per Optima) e scelte dell'offerta nel materiale del rilievo.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/zenith-optional.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { assicuraOptionalSerramenti } from "../../src/lib/listini/allinea-optional";
import { optionalZenith } from "../../src/lib/listini/zenith";
import { generaRigheOrdine } from "../../src/app/commesse-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOrdine","RigaOptional","Optional","RigaPreventivo","Commessa","Preventivo","Prodotto","Cliente","Configurazione","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const zen = await prisma.prodotto.create({ data: { brandId: b.id, tipologia: "ZENITH_F2A_UKW13", colore: "STANDARD", larghezzaMm: 1200, altezzaMm: 1400, prezzoBase: 800 } });
  await prisma.prodotto.create({ data: { brandId: b.id, tipologia: "OPTIMA_F1A", colore: "BIANCO MASSA", larghezzaMm: 800, altezzaMm: 1200, prezzoBase: 500 } });
  // listino di prima: due voci Zenith vecchie e una voce Optima con il prezzo già aumentato a mano
  const vecchia = await prisma.optional.create({ data: { brandId: b.id, categoria: "Accessorio", nome: "Motore per wasistas", valore: 350, listino: "ZENITH_WASISTAS", gruppiApplicabili: ["SERRAMENTI"] } });
  await prisma.optional.create({ data: { brandId: b.id, categoria: "Colore", nome: "Pellicole fuori standard diverse, un solo lato", tipoPrezzo: "PERCENTUALE", valore: 30, listino: "ZENITH_PF3A", gruppiApplicabili: ["SERRAMENTI"] } });
  await prisma.optional.create({ data: { brandId: b.id, categoria: "Vetri", nome: "Vetro STC (a vetro)", valore: 165, unita: "vetro", listino: "OPTIMA", gruppiApplicabili: ["SERRAMENTI"] } });

  console.log("1. Alla prima apertura di un'offerta gli optional si allineano da soli");
  const r = await assicuraOptionalSerramenti();
  const zenith = await prisma.optional.count({ where: { listino: { startsWith: "ZENITH" }, attivo: true } });
  verifica(r && zenith === optionalZenith().length, "Zenith: tutte le voci nuove (colore esterno/interno, vetri, accessori, lavorazioni)", { r, zenith, attese: optionalZenith().length });
  verifica((await prisma.optional.findUnique({ where: { id: vecchia.id } }))?.attivo === false && (await prisma.optional.count({ where: { listino: "ZENITH_PF3A", attivo: false } })) === 1, "le vecchie voci Zenith non sono più proposte");
  verifica((await prisma.optional.findFirst({ where: { listino: "OPTIMA", nome: "Vetro STC (a vetro)" } }))?.valore === 165, "i prezzi esistenti (es. aumentati) non si toccano");
  verifica(await prisma.optional.count({ where: { listino: "OPTIMA", nome: "Forma trapezoidale (fuori squadro)" } }) === 1 && await prisma.optional.count({ where: { listino: "OPTIMA_PF", nome: { startsWith: "Vetro antisfondamento" } } }) === 1, "Optima: forma trapezoidale e vetri speciali in più");
  verifica((await assicuraOptionalSerramenti()) === null && (await prisma.optional.count({ where: { listino: { startsWith: "ZENITH" } } })) === zenith + 2, "le volte dopo non fa niente (niente doppioni)");

  console.log("2. Colore esterno/interno e vetro scelti nell'offerta arrivano al rilievo");
  const cl = await prisma.cliente.create({ data: { nome: "Verdi Anna", brandId: b.id } });
  const p = await prisma.preventivo.create({ data: { clienteId: cl.id, brandId: b.id, commercialeId: ugo.id } });
  const riga = await prisma.rigaPreventivo.create({ data: { preventivoId: p.id, prodottoId: zen.id, quantita: 1, prezzoUnitario: 800, misuraLarghezza: 1200, misuraAltezza: 1400 } });
  const scegli = (categoria: string, nome: string) => prisma.optional.findFirstOrThrow({ where: { categoria, nome, listino: { startsWith: "ZENITH" } } });
  const est = await scegli("Colore esterno", "Rovere gold (AP 23) — pellicola");
  const int = await scegli("Colore interno", "Bianco massa");
  const vetro = await prisma.optional.findFirstOrThrow({ where: { categoria: "Vetri", listino: "ZENITH_F", nome: { startsWith: "Vetro insonorizzante" } } });
  for (const [o, q] of [[est, 1], [int, 1], [vetro, 2]] as const) await prisma.rigaOptional.create({ data: { rigaId: riga.id, optionalId: o.id, quantita: q, prezzoUnitario: o.valore } });
  const c = await prisma.commessa.create({ data: { numero: 1, anno: 2026, preventivoId: p.id, clienteId: cl.id, brandId: b.id } });
  g.__utente = ugo;
  await generaRigheOrdine(fd({ id: c.id })).catch((e) => { if (!String((e as { digest?: string }).digest ?? e).includes("NEXT_REDIRECT")) throw e; });
  const ro = await prisma.rigaOrdine.findFirstOrThrow({ where: { commessaId: c.id } });
  verifica(ro.descrizione.includes("Colore esterno: Rovere gold (AP 23) — pellicola") && ro.descrizione.includes("Colore interno: Bianco massa") && ro.descrizione.includes("Vetri: Vetro insonorizzante") && ro.descrizione.includes("×2"), "nel materiale della pratica: colori, vetro e quantità", ro.descrizione);

  console.log(`\n${ok} ok, ${ko} falliti`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
