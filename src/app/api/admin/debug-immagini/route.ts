import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const totale = await prisma.modelloProdotto.count();
  const conImmagine = await prisma.modelloProdotto.count({ where: { NOT: { immagineUrl: null } } });
  const campione = await prisma.modelloProdotto.findMany({
    where: { NOT: { immagineUrl: null } },
    select: { tipologia: true, immagineUrl: true },
    take: 5,
  });

  const preventivo = await prisma.preventivo.findFirst({
    where: { righe: { some: { prodottoId: { not: null } } } },
    include: { righe: { include: { prodotto: true }, take: 3 } },
    orderBy: { createdAt: "desc" },
  });
  const righeSample = preventivo?.righe
    .filter((r) => r.prodotto)
    .map((r) => ({ tipologia: r.prodotto!.tipologia, mostraDescrizione: r.mostraDescrizione }));

  return NextResponse.json({ totale, conImmagine, campione, righeSample });
}
