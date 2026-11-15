import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { daOraRoma } from "@/lib/calendario/tempo";
import { invitaRiunione } from "@/lib/calendario/server";
import { stessaPersona } from "@/lib/provvigioni/calcoli";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

/**
 * Promemoria nel calendario di P&C ONE per una o più persone (come una riunione interna, con invito .ics via email), su richiesta di Ugo.
 * POST { persone: ["Rocco Zaccaro"], titolo, note?, quando: "AAAA-MM-GGTHH:MM" (ora di Roma), durataMin?, creatoDa? }. `?prova=1` non salva.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { persone?: string[]; titolo?: string; note?: string; quando?: string; durataMin?: number; creatoDa?: string };
  const dataOra = daOraRoma(b.quando ?? "");
  if (!dataOra || !b.titolo || !b.persone?.length) return NextResponse.json({ error: "servono persone, titolo e quando" }, { status: 400 });
  const utenti = await prisma.utente.findMany({ where: { stato: "ATTIVO" }, select: { id: true, nome: true, email: true } });
  const trovati = b.persone.map((n) => ({ cercato: n, chi: utenti.filter((u) => stessaPersona(u.nome, n)) }));
  const ambigui = trovati.filter((t) => t.chi.length !== 1);
  if (ambigui.length) return NextResponse.json({ error: "persone non trovate o ambigue", ambigui: ambigui.map((a) => ({ cercato: a.cercato, trovati: a.chi.map((c) => c.nome) })) }, { status: 400 });
  const partecipanti = trovati.map((t) => t.chi[0]);
  if (req.nextUrl.searchParams.get("prova") === "1") return NextResponse.json({ prova: true, per: partecipanti.map((p) => p.nome), quando: dataOra.toISOString() });
  const r = await prisma.riunione.create({ data: { titolo: b.titolo, dataOra, durataMin: b.durataMin ?? 30, note: b.note ?? null, partecipanti: partecipanti.map((p) => p.id), creatoDaNome: b.creatoDa ?? "Ugo Perottino" } });
  const e = await invitaRiunione(r.id).catch((x) => ({ inviati: [] as string[], motivo: String(x) }));
  return NextResponse.json({ ok: true, id: r.id, per: partecipanti.map((p) => p.nome), invitoInviatoA: e.inviati.length, motivo: e.motivo ?? null });
}
