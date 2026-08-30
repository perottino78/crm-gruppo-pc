import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";

// Primo listino "serramenti" caricato come prova (finestre/portefinestre generiche
// Illumia PVC, gruppo INDOOR · SERRAMENTI) — da rimuovere prima di caricare il vero
// catalogo Zenith PVC.
const TIPOLOGIE_TEST = [
  "BLC1",
  "F1A1",
  "F2A1",
  "F3A1",
  "FF1",
  "PF1A1",
  "PF1A2",
  "PF2A1",
  "PF2A2",
  "PF3A1",
  "PF3A2",
  "STF1",
  "STFA1",
];

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

  const prodotti = await prisma.prodotto.findMany({
    where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_TEST } },
    select: { id: true, tipologia: true },
  });
  const modelli = await prisma.modelloProdotto.findMany({
    where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_TEST } },
    select: { tipologia: true },
  });
  const righeCollegate = await prisma.rigaPreventivo.findMany({
    where: { prodottoId: { in: prodotti.map((p) => p.id) } },
    select: { id: true, preventivoId: true, prodotto: { select: { tipologia: true } } },
  });

  const perTipologia: Record<string, number> = {};
  for (const t of TIPOLOGIE_TEST) perTipologia[t] = prodotti.filter((p) => p.tipologia === t).length;

  return NextResponse.json({
    ok: true,
    dryRun: true,
    prodottiTotali: prodotti.length,
    modelliTotali: modelli.length,
    prodottiPerTipologia: perTipologia,
    righeInPreventiviEsistenti: righeCollegate.map((r) => ({
      rigaId: r.id,
      preventivoId: r.preventivoId,
      tipologia: r.prodotto.tipologia,
    })),
  });
}

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

  const prodotti = await prisma.prodotto.findMany({
    where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_TEST } },
    select: { id: true, tipologia: true },
  });

  const righeCollegate = await prisma.rigaPreventivo.findMany({
    where: { prodottoId: { in: prodotti.map((p) => p.id) } },
    select: { prodottoId: true },
  });
  const idProdottiBloccati = new Set(righeCollegate.map((r) => r.prodottoId));
  const idProdottiCancellabili = prodotti.filter((p) => !idProdottiBloccati.has(p.id)).map((p) => p.id);
  const tipologieBloccate = [...new Set(prodotti.filter((p) => idProdottiBloccati.has(p.id)).map((p) => p.tipologia))];

  const prodottiCancellati = await prisma.prodotto.deleteMany({ where: { id: { in: idProdottiCancellabili } } });

  // Il modello (ModelloProdotto: immagine/descrizione/gruppo) si cancella solo se non
  // e' rimasto nessun Prodotto per quella tipologia (cioe' non era bloccata da preventivi).
  const tipologieDaCancellareModello = TIPOLOGIE_TEST.filter((t) => !tipologieBloccate.includes(t));
  const modelliCancellati = await prisma.modelloProdotto.deleteMany({
    where: { brandId: brand.id, tipologia: { in: tipologieDaCancellareModello } },
  });

  return NextResponse.json({
    ok: true,
    prodottiCancellati: prodottiCancellati.count,
    modelliCancellati: modelliCancellati.count,
    tipologieBloccateDaPreventiviEsistenti: tipologieBloccate,
  });
}
