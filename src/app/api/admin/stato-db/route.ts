import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Quanto è grande il database (prima di caricare file pesanti): MB totali e tabelle più grandi.
export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [tot] = await prisma.$queryRawUnsafe<{ mb: number }[]>("select round(pg_database_size(current_database()) / 1048576.0, 1)::float as mb");
  const tabelle = await prisma.$queryRawUnsafe<{ tabella: string; mb: number }[]>(
    "select relname as tabella, round(pg_total_relation_size(relid) / 1048576.0, 1)::float as mb from pg_catalog.pg_statio_user_tables order by pg_total_relation_size(relid) desc limit 8",
  );
  return NextResponse.json({ databaseMB: tot?.mb ?? null, tabelle });
}
