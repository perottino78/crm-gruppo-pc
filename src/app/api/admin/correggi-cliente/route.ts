import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const CAMPI = ["codiceFiscale", "provincia", "comune", "categoria", "nome"] as const;

// Solo uso tecnico (x-seed-key): correzione puntuale di pochi campi anagrafici di un cliente, su richiesta di Ugo.
export async function POST(req: NextRequest) {
  if ((req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key")) !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; dati?: Record<string, string | null> };
  if (!b.id || !b.dati) return NextResponse.json({ error: "id/dati" }, { status: 400 });
  const dati: Record<string, string | null> = {};
  for (const k of CAMPI) if (k in b.dati) dati[k] = b.dati[k] === "" ? null : b.dati[k];
  const prima = await prisma.cliente.findUnique({ where: { id: b.id }, select: { nome: true, codiceFiscale: true, provincia: true, comune: true, categoria: true } });
  if (!prima) return NextResponse.json({ error: "non trovato" }, { status: 404 });
  const dopo = await prisma.cliente.update({ where: { id: b.id }, data: dati, select: { nome: true, codiceFiscale: true, provincia: true, comune: true, categoria: true } });
  return NextResponse.json({ prima, dopo });
}
