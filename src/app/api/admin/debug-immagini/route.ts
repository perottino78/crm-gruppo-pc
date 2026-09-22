import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const righe = await prisma.rigaPreventivo.findMany({
    where: { prodottoId: { not: null } },
    include: { prodotto: true, preventivo: { select: { id: true, numeroOfferta: true, brandId: true } } },
  });

  const tipologie = [...new Set(righe.map((r) => r.prodotto!.tipologia))];
  const modelli = await prisma.modelloProdotto.findMany({
    where: { tipologia: { in: tipologie } },
    select: { tipologia: true, immagineUrl: true, brandId: true },
  });
  const modelloMap = new Map(modelli.map((m) => [`${m.brandId}|${m.tipologia}`, m]));

  const conFotoDisponibile = righe.filter((r) => {
    const m = modelloMap.get(`${r.preventivo.brandId}|${r.prodotto!.tipologia}`);
    return m?.immagineUrl;
  });

  const dettaglio = conFotoDisponibile.slice(0, 15).map((r) => {
    const m = modelloMap.get(`${r.preventivo.brandId}|${r.prodotto!.tipologia}`);
    return {
      preventivoId: r.preventivo.id,
      numeroOfferta: r.preventivo.numeroOfferta,
      tipologia: r.prodotto!.tipologia,
      immagineUrl: m?.immagineUrl,
      mostraDescrizione: r.mostraDescrizione,
    };
  });

  return NextResponse.json({
    totaleRigheConProdotto: righe.length,
    tipologieDistinte: tipologie.length,
    righeConFotoDisponibile: conFotoDisponibile.length,
    righeConFotoEMostrata: conFotoDisponibile.filter((r) => r.mostraDescrizione).length,
    dettaglio,
  });
}
