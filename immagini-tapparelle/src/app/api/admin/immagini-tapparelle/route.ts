import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import modelliData from "../../../../../prisma/seed-data/tapparelle_modelli.json";

// Aggiorna SOLO le immagini delle schede Tapparelle (foto Pracal in /immagini/tapparelle/).
// A differenza di seed-tapparelle non tocca prezzi, descrizioni, optional ne' cancella
// nulla, e non sovrascrive un'immagine gia' presente (es. inserita a mano dalla scheda).
export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";

type ModelloRow = { tipologia: string; immagineUrl?: string | null };

async function calcola() {
  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) throw new Error("brand P&C non trovato");
  const conImmagine = (modelliData as ModelloRow[]).filter((m) => m.immagineUrl);
  const esistenti = await prisma.modelloProdotto.findMany({
    where: { brandId: brand.id, tipologia: { in: conImmagine.map((m) => m.tipologia) } },
    select: { id: true, tipologia: true, immagineUrl: true },
  });
  const perTipologia = new Map(esistenti.map((e) => [e.tipologia, e]));
  const daAggiornare: { id: string; immagineUrl: string }[] = [];
  let giaPresenti = 0;
  let mancantiNelDb = 0;
  for (const m of conImmagine) {
    const e = perTipologia.get(m.tipologia);
    if (!e) mancantiNelDb++;
    else if (e.immagineUrl) giaPresenti++;
    else daAggiornare.push({ id: e.id, immagineUrl: m.immagineUrl as string });
  }
  return { daAggiornare, giaPresenti, mancantiNelDb };
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { daAggiornare, giaPresenti, mancantiNelDb } = await calcola();
    return NextResponse.json({ ok: true, dryRun: true, daAggiornare: daAggiornare.length, giaPresenti, mancantiNelDb });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { daAggiornare, giaPresenti, mancantiNelDb } = await calcola();
    for (const u of daAggiornare) {
      await prisma.modelloProdotto.update({ where: { id: u.id }, data: { immagineUrl: u.immagineUrl } });
    }
    return NextResponse.json({ ok: true, aggiornate: daAggiornare.length, giaPresenti, mancantiNelDb });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
