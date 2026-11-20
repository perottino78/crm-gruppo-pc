import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registra } from "@/lib/amministrazione/server";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;

/**
 * «Banca Carige sostituirla con Banca BPER P&C» (richiesta di Debora, 18/11/2026).
 * GET = elenco delle banche e quali verrebbero rinominate (`?da=carige&a=Banca BPER P&C`), POST = rinomina.
 * Cambia solo il nome (e il campo «banca» se contiene il vecchio nome): movimenti, saldi e IBAN restano com'erano.
 */
async function esegui(req: NextRequest, prova: boolean) {
  const da = (req.nextUrl.searchParams.get("da") ?? "carige").trim().toLowerCase();
  const a = (req.nextUrl.searchParams.get("a") ?? "Banca BPER P&C").trim();
  const conti = await prisma.contoFinanziario.findMany({ select: { id: true, nome: true, banca: true, iban: true, tipo: true, attivo: true }, orderBy: { nome: "asc" } });
  const daRinominare = conti.filter((c) => `${c.nome} ${c.banca ?? ""}`.toLowerCase().includes(da));
  if (!prova) {
    for (const c of daRinominare) {
      await prisma.contoFinanziario.update({ where: { id: c.id }, data: { nome: a, ...(c.banca && c.banca.toLowerCase().includes(da) ? { banca: a } : {}) } });
      await registra("Conto", c.id, "Banca rinominata", `${c.nome} → ${a}`, "Aggiornamento amministrazione");
    }
  }
  return NextResponse.json({ ok: true, prova, da, a, banche: conti.map((c) => ({ nome: c.nome, banca: c.banca, ibanFinisce: c.iban?.slice(-4) ?? null, attivo: c.attivo })), rinominate: daRinominare.map((c) => c.nome) });
}

export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ ok: false }, { status: 401 });
  return esegui(req, true);
}
export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ ok: false }, { status: 401 });
  return esegui(req, false);
}
