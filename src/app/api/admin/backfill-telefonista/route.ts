import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { telefonistaDefaultPerBrand } from "@/lib/leadIngest";

export const dynamic = "force-dynamic";

// POST /api/admin/backfill-telefonista
// Assegna la telefonista di default a tutti i lead senza telefonistaId.
export async function POST(req: NextRequest) {
  const utente = await getCurrentUser();
  if (!isAmministratore(utente)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const override = (await req.json().catch(() => ({}))).telefonistaId as string | undefined;

  const leadSenzaTel = await prisma.lead.findMany({
    where: { telefonistaId: null },
    select: { id: true, brandId: true },
  });

  let aggiornati = 0;
  for (const lead of leadSenzaTel) {
    const telefonistaId = override ?? await telefonistaDefaultPerBrand(lead.brandId);
    if (!telefonistaId) continue;
    await prisma.lead.update({ where: { id: lead.id }, data: { telefonistaId } });
    aggiornati++;
  }

  return NextResponse.json({ ok: true, totale: leadSenzaTel.length, aggiornati });
}
