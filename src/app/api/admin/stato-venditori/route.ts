import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SIGLE_COMMERCIALI, NOMI_COMMERCIALI } from "@/lib/clienti/bconsole";
import { sigleDi } from "@/lib/provvigioni/calcoli";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

/** Sola lettura: per ogni sigla venditore delle fatture BConsole, quante fatture ha e a quale utente del CRM si aggancia. */
export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [gruppi, utenti] = await Promise.all([
    prisma.fatturaVendita.groupBy({ by: ["venditore"], _count: true, _sum: { imponibile: true } }),
    prisma.utente.findMany({ select: { nome: true, username: true, ruolo: true, stato: true } }),
  ]);
  return NextResponse.json(gruppi.map((g) => {
    const s = (g.venditore ?? "").toUpperCase();
    const chi = utenti.filter((u) => sigleDi(u, SIGLE_COMMERCIALI, NOMI_COMMERCIALI).includes(s));
    return { sigla: g.venditore, fatture: g._count, imponibile: Math.round(g._sum.imponibile ?? 0), attesoUtente: SIGLE_COMMERCIALI[s] ?? null, agganciataA: chi.map((u) => `${u.nome} (${u.username}, ${u.ruolo}, ${u.stato})`) };
  }).sort((a, b) => b.fatture - a.fatture));
}
