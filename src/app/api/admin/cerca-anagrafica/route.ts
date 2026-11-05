import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Solo uso tecnico (x-seed-key): cerca un cliente o lead per nome, email, telefono o codice fiscale (per capire perché «non si trova»).
export async function GET(req: NextRequest) {
  if ((req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key")) !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const termini = req.nextUrl.searchParams.getAll("q").map((x) => x.trim()).filter((x) => x.length >= 3).slice(0, 6);
  if (!termini.length) return NextResponse.json({ error: "q" }, { status: 400 });
  const or = termini.flatMap((t) => [
    { nome: { contains: t, mode: "insensitive" as const } }, { email: { contains: t, mode: "insensitive" as const } },
    { telefono: { contains: t } }, { cellulare: { contains: t } }, { codiceFiscale: { equals: t, mode: "insensitive" as const } },
  ]);
  const clienti = await prisma.cliente.findMany({
    where: { OR: or }, take: 20,
    select: { id: true, nome: true, comune: true, provincia: true, email: true, telefono: true, cellulare: true, codiceFiscale: true, bconsoleId: true, categoria: true, origine: true, createdAt: true, brand: { select: { nome: true } }, responsabile: { select: { nome: true } } },
  });
  const lead = await prisma.lead.findMany({
    where: { OR: termini.flatMap((t) => [{ nome: { contains: t, mode: "insensitive" as const } }, { email: { contains: t, mode: "insensitive" as const } }, { telefono: { contains: t } }]) }, take: 20,
    select: { id: true, nome: true, comune: true, email: true, telefono: true, fase: true, createdAt: true, telefonista: { select: { nome: true } } },
  });
  return NextResponse.json({ clienti, lead });
}
