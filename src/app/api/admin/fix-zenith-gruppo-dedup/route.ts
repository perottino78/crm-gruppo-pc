import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";

// Fix una tantum: lo spostamento di Zenith dal gruppo "SERRAMENTI PVC ZENITH" al gruppo
// "SERRAMENTI" ha causato la creazione di 10 Optional duplicati (la route seed-zenith
// cercava gli esistenti filtrando per il NUOVO gruppiApplicabili, senza trovare i 10
// vecchi ancora taggati col nome precedente). Questa route ricongiunge le coppie
// duplicate: sposta eventuali RigaOptional dal vecchio id al nuovo, poi cancella il
// vecchio Optional orfano taggato "SERRAMENTI PVC ZENITH".
const VECCHIO_TAG = "SERRAMENTI PVC ZENITH";
const NUOVO_TAG = "SERRAMENTI";
const key = (o: { categoria: string; nome: string; listino: string | null }) => `${o.categoria}|${o.nome}|${o.listino ?? ""}`;

export async function GET(req: NextRequest) {
  const k = req.headers.get("x-seed-key");
  if (k !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

  const vecchi = await prisma.optional.findMany({ where: { brandId: brand.id, gruppiApplicabili: { has: VECCHIO_TAG } } });
  const nuovi = await prisma.optional.findMany({ where: { brandId: brand.id, gruppiApplicabili: { has: NUOVO_TAG } } });
  const mappaNuovi = new Map(nuovi.map((o) => [key(o), o]));

  const coppie = vecchi.map((v) => {
    const n = mappaNuovi.get(key(v));
    return { vecchioId: v.id, nome: v.nome, categoria: v.categoria, nuovoId: n?.id ?? null };
  });

  const rigaOptionaliSuVecchi = await prisma.rigaOptional.findMany({
    where: { optionalId: { in: vecchi.map((v) => v.id) } },
    select: { id: true, optionalId: true, rigaId: true },
  });

  return NextResponse.json({
    ok: true,
    dryRun: true,
    vecchiTotali: vecchi.length,
    nuoviTotali: nuovi.length,
    coppie,
    rigaOptionaliCollegateAiVecchi: rigaOptionaliSuVecchi,
  });
}

export async function POST(req: NextRequest) {
  const k = req.headers.get("x-seed-key");
  if (k !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

  const vecchi = await prisma.optional.findMany({ where: { brandId: brand.id, gruppiApplicabili: { has: VECCHIO_TAG } } });
  const nuovi = await prisma.optional.findMany({ where: { brandId: brand.id, gruppiApplicabili: { has: NUOVO_TAG } } });
  const mappaNuovi = new Map(nuovi.map((o) => [key(o), o]));

  let rigaOptionaliMigrate = 0;
  let vecchiCancellati = 0;
  const nonAbbinati: string[] = [];

  for (const v of vecchi) {
    const n = mappaNuovi.get(key(v));
    if (!n) {
      // Nessun corrispondente nuovo: non era un duplicato del reseed, lascialo stare.
      nonAbbinati.push(`${v.categoria}|${v.nome}`);
      continue;
    }
    const migrate = await prisma.rigaOptional.updateMany({
      where: { optionalId: v.id },
      data: { optionalId: n.id },
    });
    rigaOptionaliMigrate += migrate.count;
    await prisma.optional.delete({ where: { id: v.id } });
    vecchiCancellati++;
  }

  return NextResponse.json({ ok: true, vecchiCancellati, rigaOptionaliMigrate, nonAbbinati });
}
