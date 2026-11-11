import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stessaPersona } from "@/lib/provvigioni/calcoli";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

/**
 * «Vende anche» (Utente.vende) per chi fa offerte pur avendo un altro ruolo. Si cambia anche da Team › scheda persona;
 * questa rotta serve a impostarlo senza aprire il CRM. GET = chi vende; POST { nomi: ["Laura Pinto"], vende: true } (per nome o username).
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = await prisma.utente.findMany({ where: { OR: [{ vende: true }, { ruolo: "COMMERCIALE" }] }, select: { nome: true, ruolo: true, vende: true, stato: true }, orderBy: { nome: "asc" } });
  return NextResponse.json(u);
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const corpo = (await req.json().catch(() => ({}))) as { nomi?: string[]; vende?: boolean };
  const vende = corpo.vende !== false;
  const utenti = await prisma.utente.findMany({ select: { id: true, nome: true, username: true, ruolo: true } });
  const esito: { cercato: string; trovati: string[] }[] = [];
  for (const n of corpo.nomi ?? []) {
    const chi = utenti.filter((u) => u.username === n || stessaPersona(u.nome, n));
    if (chi.length === 1) await prisma.utente.update({ where: { id: chi[0].id }, data: { vende } });
    esito.push({ cercato: n, trovati: chi.map((u) => `${u.nome} (${u.ruolo})${chi.length > 1 ? " — più persone: non cambiato" : ""}`) });
  }
  return NextResponse.json({ ok: true, vende, esito });
}
