import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { scopeClienteWhere } from "@/lib/scope";

export const dynamic = "force-dynamic";

// Ricerca clienti per i campi "Cliente" (calendario, nuovi appuntamenti): nome, telefono, email, comune
export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "login" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);
  const parole = q.split(/\s+/).slice(0, 4);
  const clienti = await prisma.cliente.findMany({
    where: {
      AND: [
        scopeClienteWhere(u),
        ...parole.map((p) => ({
          OR: [
            { nome: { contains: p, mode: "insensitive" as const } },
            { telefono: { contains: p } },
            { email: { contains: p, mode: "insensitive" as const } },
            { comune: { contains: p, mode: "insensitive" as const } },
          ],
        })),
      ],
    },
    select: { id: true, nome: true, comune: true, telefono: true, indirizzo: true, cap: true, provincia: true },
    orderBy: { nome: "asc" },
    take: 12,
  });
  return NextResponse.json(
    clienti.map((c) => ({
      id: c.id, nome: c.nome, sotto: [c.comune, c.telefono].filter(Boolean).join(" · "),
      indirizzo: [c.indirizzo, [c.cap, c.comune].filter(Boolean).join(" "), c.provincia ? `(${c.provincia})` : null].filter(Boolean).join(", "),
    })),
  );
}
