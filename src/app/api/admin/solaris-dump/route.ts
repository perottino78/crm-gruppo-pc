import { NextResponse } from "next/server";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/admin/solaris-dump — recupera prodotti e componenti Solaris
export async function GET() {
  const utente = await getCurrentUser();
  if (!isAmministratore(utente)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const brand = await prisma.brand.findFirst({ where: { nome: "Solaris" } });
  if (!brand) {
    return NextResponse.json({ error: "Brand Solaris non trovato" }, { status: 404 });
  }

  const [componenti, prodotti] = await Promise.all([
    prisma.solarisComponente.findMany({
      where: { brandId: brand.id },
      orderBy: [{ categoria: "asc" }, { potenzaW: "asc" }],
    }),
    prisma.prodotto.findMany({
      where: { brandId: brand.id },
      orderBy: [{ tipologia: "asc" }],
      take: 200,
    }),
  ]);

  return NextResponse.json({ componenti, prodotti_count: prodotti.length, prodotti });
}
