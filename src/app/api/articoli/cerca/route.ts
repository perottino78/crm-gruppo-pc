// Ricerca veloce di articoli per la scheda (distinta base e correlati): codice, descrizione o codice del fornitore.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { visibilitaArticoliWhere } from "@/lib/articoli/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ articoli: [] });
  const vis = visibilitaArticoliWhere(u);
  const parole = q.split(/\s+/).slice(0, 5);
  const articoli = await prisma.articolo.findMany({
    where: { attivo: true, AND: [...(vis ? [vis] : []), ...parole.map((p) => ({ OR: [{ descrizione: { contains: p, mode: "insensitive" as const } }, { codice: { contains: p, mode: "insensitive" as const } }, { codiceFornitore: { contains: p, mode: "insensitive" as const } }] }))] },
    select: { id: true, codice: true, descrizione: true, um: true, costoAcquisto: true, prezzoVendita: true },
    orderBy: { codice: "asc" }, take: 12,
  });
  return NextResponse.json({ articoli });
}
