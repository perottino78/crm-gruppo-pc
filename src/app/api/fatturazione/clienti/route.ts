import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoFatturazione } from "@/lib/fatturazione/server";

export const dynamic = "force-dynamic";

// Ricerca clienti per fatture e DDT: chi fattura vede tutti i clienti (nome, P.IVA/CF, comune, telefono).
export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u || !puoFatturazione(u)) return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);
  const parole = q.split(/\s+/).slice(0, 4);
  const clienti = await prisma.cliente.findMany({
    where: {
      AND: parole.map((p) => ({
        OR: [
          { nome: { contains: p, mode: "insensitive" as const } }, { piva: { contains: p } }, { codiceFiscale: { contains: p, mode: "insensitive" as const } },
          { telefono: { contains: p } }, { comune: { contains: p, mode: "insensitive" as const } },
        ],
      })),
    },
    select: { id: true, nome: true, comune: true, telefono: true, indirizzo: true, cap: true, provincia: true, piva: true, codiceFiscale: true },
    orderBy: { nome: "asc" },
    take: 12,
  });
  return NextResponse.json(clienti.map((c) => ({
    id: c.id, nome: c.nome, sotto: [c.comune, c.piva ? `P.IVA ${c.piva}` : c.codiceFiscale ? `CF ${c.codiceFiscale}` : null, c.telefono].filter(Boolean).join(" · "),
    indirizzo: [c.indirizzo, [c.cap, c.comune].filter(Boolean).join(" "), c.provincia ? `(${c.provincia})` : null].filter(Boolean).join(", "),
  })));
}
