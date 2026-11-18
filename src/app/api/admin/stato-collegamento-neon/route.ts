import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Sola lettura: cosa Vercel ha collegato al database Neon (nomi delle variabili, ID progetto, indirizzo senza credenziali).
// Non mostra mai password, chiavi o valori segreti.
export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const nomi = Object.keys(process.env).filter((k) => /NEON|PG|POSTGRES|DATABASE|STORAGE|VERCEL_(ENV|PROJECT|TEAM|ORG)|^VERCEL$/i.test(k)).sort();
  const url = (v?: string) => {
    if (!v) return null;
    try { const u = new URL(v); return { host: u.hostname, db: u.pathname.slice(1), parametri: [...u.searchParams.keys()] }; } catch { return "non leggibile"; }
  };
  return NextResponse.json({
    variabili: nomi,
    neonProjectId: process.env.NEON_PROJECT_ID ?? null,
    databaseUrl: url(process.env.DATABASE_URL),
    databaseUrlSenzaPool: url(process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING),
    vercelProject: process.env.VERCEL_PROJECT_ID ?? null,
    vercelTeam: process.env.VERCEL_TEAM_ID ?? process.env.VERCEL_ORG_ID ?? null,
    neonApiKeyPresente: !!process.env.NEON_API_KEY,
  });
}
