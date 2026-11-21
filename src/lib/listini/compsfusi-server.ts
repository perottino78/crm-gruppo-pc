// Porta i colori MV Living nei componenti struttura già a listino, da soli, una volta per versione (come `assicuraOptionalSerramenti`).
import { prisma } from "@/lib/prisma";
import { PREFISSO_COMPSFUSI, righeColoriMancanti } from "./compsfusi";

const VERSIONE = "2026-11-21";
const CHIAVE = "compsfusi_colori_versione";

export async function assicuraColoriCompsfusi() {
  try {
    const c = await prisma.configurazione.findUnique({ where: { chiave: CHIAVE }, select: { valore: true } });
    if (c?.valore === VERSIONE) return 0;
    // in Prisma «_» in startsWith vale qualsiasi carattere: si ricontrolla il prefisso in JS
    const righe = (await prisma.prodotto.findMany({ where: { tipologia: { startsWith: PREFISSO_COMPSFUSI } }, select: { brandId: true, tipologia: true, colore: true, altezzaMm: true, larghezzaMm: true, prezzoBase: true, coefficienteRicarico: true } }))
      .filter((r) => r.tipologia.startsWith(PREFISSO_COMPSFUSI));
    let creati = 0;
    for (const brandId of [...new Set(righe.map((r) => r.brandId))]) {
      const nuove = righeColoriMancanti(righe.filter((r) => r.brandId === brandId));
      if (nuove.length) { await prisma.prodotto.createMany({ data: nuove.map((n) => ({ ...n, brandId })) }); creati += nuove.length; }
    }
    await prisma.configurazione.upsert({ where: { chiave: CHIAVE }, create: { chiave: CHIAVE, valore: VERSIONE }, update: { valore: VERSIONE } });
    return creati;
  } catch (e) {
    console.error("assicuraColoriCompsfusi", e);
    return 0;
  }
}
