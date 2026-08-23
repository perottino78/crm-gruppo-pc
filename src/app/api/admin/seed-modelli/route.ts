import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import illumiaModelli from "../../../../../prisma/seed-data/modelli_illumia.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

const PREFISSI_OUTDOOR_PERGOLE = ["LUCILLA_", "NUVOLA_", "PANAREA_"];

type ModelloRow = {
  tipologia: string;
  immagineUrl: string | null;
  descrizioneTecnica: string | null;
  famiglia: string;
  gruppo: string;
};

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
    if (!brand) {
      return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });
    }

    let illumiaAggiornati = 0;
    for (const m of illumiaModelli as ModelloRow[]) {
      await prisma.modelloProdotto.upsert({
        where: { brandId_tipologia: { brandId: brand.id, tipologia: m.tipologia } },
        create: {
          brandId: brand.id,
          tipologia: m.tipologia,
          immagineUrl: m.immagineUrl,
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
        },
        update: {
          immagineUrl: m.immagineUrl,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
        },
      });
      illumiaAggiornati++;
    }

    // Tagga Outdoor/Pergole tutte le tipologie delle linee pergole già a catalogo,
    // senza toccare immagine/descrizione se già impostate a mano.
    const tipologiePergole = await prisma.prodotto.findMany({
      where: { brandId: brand.id, OR: PREFISSI_OUTDOOR_PERGOLE.map((p) => ({ tipologia: { startsWith: p } })) },
      select: { tipologia: true },
      distinct: ["tipologia"],
    });

    let pergoleTaggate = 0;
    for (const { tipologia } of tipologiePergole) {
      await prisma.modelloProdotto.upsert({
        where: { brandId_tipologia: { brandId: brand.id, tipologia } },
        create: { brandId: brand.id, tipologia, famiglia: "OUTDOOR", gruppo: "PERGOLE" },
        update: { famiglia: "OUTDOOR", gruppo: "PERGOLE" },
      });
      pergoleTaggate++;
    }

    return NextResponse.json({ ok: true, illumiaAggiornati, pergoleTaggate });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
