import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Backfill una tantum: assegna numeroOfferta ai preventivi creati prima dell'introduzione
// del campo, in ordine cronologico (createdAt asc), progressivo per brand+anno solare.
// Idempotente: aggiorna solo i preventivi con numeroOfferta ancora nullo.
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const preventivi = await prisma.preventivo.findMany({
      where: { numeroOfferta: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, brandId: true, createdAt: true },
    });

    const contatori: Record<string, number> = {};
    const assegnati: { id: string; anno: number; numeroOfferta: number }[] = [];

    for (const p of preventivi) {
      const anno = p.createdAt.getFullYear();
      const chiave = `${p.brandId}_${anno}`;
      contatori[chiave] = (contatori[chiave] ?? 0) + 1;
      const numeroOfferta = contatori[chiave];
      await prisma.preventivo.update({ where: { id: p.id }, data: { numeroOfferta } });
      assegnati.push({ id: p.id, anno, numeroOfferta });
    }

    return NextResponse.json({ ok: true, aggiornati: assegnati.length, dettaglio: assegnati });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
