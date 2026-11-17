import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fotoOptionalPortoncino } from "@/lib/listini/portoncini-foto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Mette le foto a pannelli decorativi, maniglioni, maniglie, buca delle lettere e spioncino dei portoncini PVC (listino PORTONCINOPVC).
// Solo dove la foto manca: non tocca prezzi né altro. GET = prova, POST = esegue. Rilanciabile.
async function esegui(prova: boolean) {
  const opt = await prisma.optional.findMany({ where: { listino: "PORTONCINOPVC" }, select: { id: true, categoria: true, nome: true, immagineUrl: true } });
  let aggiornati = 0, giaPresenti = 0, senzaFoto = 0;
  for (const o of opt) {
    const url = fotoOptionalPortoncino(o.categoria, o.nome);
    if (!url) { senzaFoto++; continue; }
    if (o.immagineUrl) { giaPresenti++; continue; }
    aggiornati++;
    if (!prova) await prisma.optional.update({ where: { id: o.id }, data: { immagineUrl: url } });
  }
  return { ok: true, prova, optional: opt.length, aggiornati, giaPresenti, senzaFoto };
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await esegui(true));
}
export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json(await esegui(false)); } catch (e) { return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 }); }
}
