// Allineamento automatico degli optional dei serramenti (Zenith, Optima 70, Fidra, Plasma 30) dopo una modifica del codice, senza
// dover rilanciare le rotte seed-*: alla prima apertura di un'offerta con la versione nuova crea solo le voci che mancano (mai cambiare
// i prezzi esistenti: possono essere stati aumentati con «Aumenti listini») e toglie dall'offerta le vecchie voci Zenith sostituite.
import { prisma } from "@/lib/prisma";
import { optionalZenith, PREFISSO_ZENITH } from "./zenith";
import { optionalOptima, PREFISSO_OPTIMA } from "./optima";
import { optionalFidra } from "./fidra";
import { optionalPlasma30 } from "./plasma30";
import type { VoceOptional } from "./serramenti-comuni";

export const VERSIONE_OPTIONAL_SERRAMENTI = "2026-11-16";
const CHIAVE = "optional_serramenti_versione";
const chiave = (o: { categoria: string; nome: string; listino: string | null }) => `${o.categoria}|${o.nome}|${o.listino ?? ""}`;

/** Vecchi listini Zenith (optional del primo caricamento) sostituiti dai nuovi: non più proposti, restano sulle offerte già fatte. */
const LISTINI_ZENITH_VECCHI = ["ZENITH_PF3A_SOGLIA", "ZENITH_WASISTAS"];
const VECCHIE_ZENITH_PF3A = ["Pellicole fuori standard diverse, un solo lato", "Pellicole fuori standard diverse, due lati diversi"];

/** Brand che ha prodotti con questo prefisso (in Prisma «_» in startsWith vale qualsiasi carattere: si ricontrolla). */
async function brandCon(prefisso: string): Promise<string | null> {
  const p = await prisma.prodotto.findMany({ where: { tipologia: { startsWith: prefisso } }, select: { brandId: true, tipologia: true }, take: 5 });
  return p.find((x) => x.tipologia.startsWith(prefisso))?.brandId ?? null;
}

async function creaMancanti(brandId: string, voci: VoceOptional[], prefissoListino: string) {
  const esistenti = await prisma.optional.findMany({ where: { brandId, listino: { startsWith: prefissoListino } }, select: { categoria: true, nome: true, listino: true } });
  const ci = new Set(esistenti.map(chiave));
  const nuove = voci.filter((v) => !ci.has(chiave(v)));
  if (nuove.length) await prisma.optional.createMany({ data: nuove.map((v) => ({ brandId, ...v, gruppiApplicabili: ["SERRAMENTI"] })) });
  return nuove.length;
}

/** Crea le voci nuove e spegne le vecchie Zenith. Restituisce quante voci ha creato e spento. */
export async function allineaOptionalSerramenti() {
  let creati = 0, spenti = 0;
  const zenith = await brandCon(PREFISSO_ZENITH);
  if (zenith) {
    creati += await creaMancanti(zenith, optionalZenith(), "ZENITH");
    spenti += (await prisma.optional.updateMany({
      where: { brandId: zenith, attivo: true, OR: [{ listino: { in: LISTINI_ZENITH_VECCHI } }, { listino: "ZENITH_PF3A", nome: { in: VECCHIE_ZENITH_PF3A } }] },
      data: { attivo: false },
    })).count;
  }
  const optima = await brandCon(PREFISSO_OPTIMA);
  if (optima) creati += await creaMancanti(optima, optionalOptima(), "OPTIMA");
  const fidra = await brandCon("FIDRA_");
  if (fidra) creati += await creaMancanti(fidra, optionalFidra(), "FIDRA");
  const plasma = await brandCon("PLASMA30");
  if (plasma) creati += await creaMancanti(plasma, optionalPlasma30(), "PLASMA30");
  return { creati, spenti };
}

/** Da chiamare all'apertura dell'offerta: lavora solo la prima volta dopo una nuova versione (una lettura sola le altre volte). */
export async function assicuraOptionalSerramenti() {
  const c = await prisma.configurazione.findUnique({ where: { chiave: CHIAVE }, select: { valore: true } });
  if (c?.valore === VERSIONE_OPTIONAL_SERRAMENTI) return null;
  try {
    const r = await allineaOptionalSerramenti();
    await prisma.configurazione.upsert({ where: { chiave: CHIAVE }, create: { chiave: CHIAVE, valore: VERSIONE_OPTIONAL_SERRAMENTI }, update: { valore: VERSIONE_OPTIONAL_SERRAMENTI } });
    return r;
  } catch (e) {
    console.error("assicuraOptionalSerramenti", e);
    return null;
  }
}
