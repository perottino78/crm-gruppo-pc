import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { daOraRoma } from "@/lib/calendario/tempo";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

/** Diagnosi in sola lettura di un giorno: appuntamenti di P&C ONE e impegni letti dai calendari esterni. GET ?giorno=AAAA-MM-GG */
export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const g = req.nextUrl.searchParams.get("giorno") ?? "";
  const da = daOraRoma(`${g}T00:00`), a = da ? new Date(da.getTime() + 86_400_000) : null;
  if (!da || !a) return NextResponse.json({ error: "giorno AAAA-MM-GG" }, { status: 400 });
  const ora = (d: Date) => d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  const [app, est, utenti] = await Promise.all([
    prisma.appuntamento.findMany({ where: { dataOra: { gte: da, lt: a } }, include: { cliente: { select: { nome: true } } }, orderBy: { dataOra: "asc" } }),
    prisma.eventoNextcloud.findMany({ where: { inizio: { lt: a }, fine: { gt: da } }, orderBy: { inizio: "asc" } }),
    prisma.utente.findMany({ select: { id: true, nome: true } }),
  ]);
  const nome = new Map(utenti.map((u) => [u.id, u.nome]));
  return NextResponse.json({
    appuntamenti: app.map((x) => ({ ora: ora(x.dataOra), persona: nome.get(x.utenteId ?? "") ?? null, cliente: x.cliente?.nome, titolo: x.titolo, stato: x.stato, bc: x.chiaveImport, creato: x.createdAt })),
    esterni: est.map((x) => ({ ora: ora(x.inizio), persona: nome.get(x.utenteId) ?? null, titolo: x.titolo, calendario: x.calendario.slice(0, 20), diOne: !!x.chiave })),
  });
}
