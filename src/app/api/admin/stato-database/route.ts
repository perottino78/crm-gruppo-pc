import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { misureInterne } from "@/lib/database/consumi-server";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Diagnosi del traffico del database (sola lettura, niente dati personali): spazio, tabelle più lette e, se Neon ha
// pg_stat_statements attivo, le interrogazioni che restituiscono più righe. Serve a capire cosa alleggerire.
export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const interne = await misureInterne();
  let interrogazioni: unknown = "pg_stat_statements non disponibile";
  try {
    const r = await prisma.$queryRawUnsafe<{ q: string; chiamate: bigint; righe: bigint; ms: number }[]>(
      `SELECT left(query, 220) AS q, calls AS chiamate, rows AS righe, round(total_exec_time)::float AS ms
       FROM pg_stat_statements ORDER BY rows DESC LIMIT 25`,
    );
    interrogazioni = r.map((x) => ({ q: x.q, chiamate: Number(x.chiamate), righe: Number(x.righe), ms: x.ms }));
  } catch { /* estensione non attiva */ }
  const [avvio] = await prisma.$queryRawUnsafe<{ t: Date }[]>("SELECT pg_postmaster_start_time() AS t");
  return NextResponse.json({ statisticheDal: avvio?.t, ...interne, interrogazioni });
}
