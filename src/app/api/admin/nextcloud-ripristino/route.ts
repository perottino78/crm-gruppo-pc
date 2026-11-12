import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CHIAVI_NC, configNextcloud } from "@/lib/calendario/nextcloud";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const MOTIVO = "Cancellato sul calendario Nextcloud";

/**
 * Dopo il collegamento a Nextcloud: cosa ha toccato la sincronizzazione negli appuntamenti di P&C ONE.
 * GET (sola lettura): ?persona=<parte del nome> per gli appuntamenti di una persona cambiati dal collegamento in poi.
 * POST: rimette in piedi gli appuntamenti annullati dalla sincronizzazione (P&C ONE ha la precedenza).
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const persona = req.nextUrl.searchParams.get("persona") ?? "";
  const dal = new Date(req.nextUrl.searchParams.get("dal") ?? Date.now() - 2 * 86_400_000);
  const cfg = await configNextcloud();
  const utenti = await prisma.utente.findMany({ where: persona ? { nome: { contains: persona, mode: "insensitive" } } : {}, select: { id: true, nome: true } });
  const ids = utenti.map((u) => u.id);
  const [annullatiDaNc, cambiati, eventi, ultima] = await Promise.all([
    prisma.appuntamento.findMany({ where: { esito: MOTIVO }, select: { id: true, utenteId: true, dataOra: true, stato: true, titolo: true, updatedAt: true } }),
    prisma.appuntamento.findMany({ where: { utenteId: { in: ids }, updatedAt: { gte: dal } }, select: { id: true, dataOra: true, durataMin: true, stato: true, esito: true, titolo: true, chiaveImport: true, updatedAt: true }, orderBy: { updatedAt: "asc" } }),
    prisma.eventoNextcloud.groupBy({ by: ["utenteId", "calendario"], _count: true, where: { utenteId: { in: ids } } }),
    prisma.configurazione.findUnique({ where: { chiave: CHIAVI_NC.stato } }),
  ]);
  return NextResponse.json({
    stato: ultima?.valore ?? null,
    calendari: cfg.calendari.map((c) => ({ nome: c.nome, persona: utenti.find((u) => u.id === c.utenteId)?.nome ?? (c.utenteId ? "altra persona" : null), scrivi: c.scrivi })),
    persone: utenti.map((u) => u.nome),
    annullatiDaNextcloud: annullatiDaNc.length,
    cambiatiDal: dal.toISOString(),
    cambiati,
    eventiNextcloud: eventi,
  });
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prova = req.nextUrl.searchParams.get("esegui") !== "1";
  const daRipristinare = await prisma.appuntamento.findMany({ where: { esito: MOTIVO, stato: "ANNULLATO" }, select: { id: true } });
  if (!prova) await prisma.appuntamento.updateMany({ where: { id: { in: daRipristinare.map((a) => a.id) } }, data: { stato: "PROGRAMMATO", esito: null } });
  // gli abbinamenti salvati degli impegni di P&C ONE si azzerano: al giro dopo P&C ONE li riscrive com'è lui
  if (!prova) await prisma.eventoNextcloud.updateMany({ where: { chiave: { not: null } }, data: { impronta: null } });
  return NextResponse.json({ prova, ripristinati: daRipristinare.length });
}
