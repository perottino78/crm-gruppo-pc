import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { visibilitaArticoliWhere } from "@/lib/articoli/server";
import { categorieDelListino } from "@/lib/articoli/posizione";
import { assicuraArticoliLegno } from "@/lib/ordini/legno-server";

export const dynamic = "force-dynamic";

/**
 * Articoli (ricambi…) collegati a una famiglia/gruppo del listino, per la finestra «Aggiungi prodotto» dell'offerta (richiesta di Ugo, 18/11/2026).
 * `?famiglia=OUTDOOR&gruppo=VETRATE` (senza gruppo: gli articoli collegati alla sola famiglia). Solo quelli visibili a chi chiede.
 */
export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  const famiglia = req.nextUrl.searchParams.get("famiglia") ?? "";
  const gruppo = req.nextUrl.searchParams.get("gruppo") || null;
  if (!famiglia) return NextResponse.json({ articoli: [] });
  await assicuraArticoliLegno(); // i legni piallati delle vetrate (una volta sola)
  const cat = await prisma.categoriaArticolo.findMany({ select: { id: true, padreId: true, famiglia: true, gruppoListino: true } });
  const ids = categorieDelListino(famiglia, gruppo, cat);
  if (!ids.length) return NextResponse.json({ articoli: [] });
  const vis = visibilitaArticoliWhere(u);
  const articoli = await prisma.articolo.findMany({
    where: { attivo: true, categoriaId: { in: ids }, ...(vis ? { AND: [vis] } : {}) },
    select: { id: true, codice: true, descrizione: true, um: true, prezzoVendita: true, aliquotaIva: true, categoria: { select: { nome: true } } },
    orderBy: [{ descrizione: "asc" }], take: 150,
  });
  return NextResponse.json({ articoli });
}
