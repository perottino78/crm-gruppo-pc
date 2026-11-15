import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// A che punto sono le campagne non ancora finite (sola lettura, niente dati personali): invii per stato e il più vecchio «in corso».
export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const campagne = await prisma.campagna.findMany({
    where: { OR: [{ stato: { in: ["IN_INVIO", "PROGRAMMATA"] } }, { updatedAt: { gte: new Date(Date.now() - 3 * 86400_000) } }] },
    select: { id: true, nome: true, stato: true, inviataIl: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  const out = [];
  for (const c of campagne) {
    const g = await prisma.campagnaInvio.groupBy({ by: ["stato"], where: { campagnaId: c.id }, _count: { _all: true } });
    const inCorso = await prisma.campagnaInvio.findFirst({ where: { campagnaId: c.id, stato: "IN_CORSO" }, orderBy: { presoIl: "asc" }, select: { presoIl: true, tentativi: true } });
    const motivi = await prisma.campagnaInvio.groupBy({ by: ["motivo"], where: { campagnaId: c.id, stato: { in: ["FALLITA", "SOPPRESSA"] } }, _count: { _all: true } });
    out.push({ ...c, invii: Object.fromEntries(g.map((x) => [x.stato, x._count._all])), inCorsoDal: inCorso?.presoIl ?? null, motivi: motivi.map((m) => ({ motivo: m.motivo, n: m._count._all })) });
  }
  return NextResponse.json({ adesso: new Date().toISOString(), campagne: out });
}
