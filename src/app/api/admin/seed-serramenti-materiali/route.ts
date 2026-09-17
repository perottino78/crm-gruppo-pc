import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/serramenti_materiali_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/serramenti_materiali_modelli.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";

// Segnaposto "in arrivo" per i 5 materiali Serramenti oltre al PVC (gia' a listino
// come Zenith): PVC-Alluminio, Alluminio, Alluminio a taglio freddo, Legno,
// Legno-Alluminio. Compaiono nell'albero come sottogruppi di SERRAMENTI, disabilitati
// (vedi IN_ARRIVO in prodotti.ts) finche' non arrivano i listini reali — stesso
// pattern gia' usato per Pensilina Dritta.
type ProdottoRow = { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number; prezzoBase: number };
type ModelloRow = {
  tipologia: string;
  descrizioneTecnica: string;
  famiglia: string;
  gruppo: string;
  immagineUrl?: string | null;
  modalitaCalcolo: string;
  parametriCalcolo: Record<string, number>;
};

const TIPOLOGIE_PREFIXES = ["SERRAMENTI_"];
const keyProdotto = (p: { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number }) =>
  `${p.tipologia}|${p.colore}|${p.altezzaMm}|${p.larghezzaMm}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    const prodottiNuovi = prodottiData as ProdottoRow[];
    const prodottiEsistenti = await prisma.prodotto.findMany({
      where: { brandId: brand.id, OR: TIPOLOGIE_PREFIXES.map((p) => ({ tipologia: { startsWith: p } })) },
    });
    const mappaProdotti = new Map(prodottiEsistenti.map((p) => [keyProdotto(p), p]));

    let prodottiCreati = 0;
    let prodottiInvariati = 0;
    for (const p of prodottiNuovi) {
      const esistente = mappaProdotti.get(keyProdotto(p));
      if (!esistente) {
        await prisma.prodotto.create({
          data: {
            brandId: brand.id,
            tipologia: p.tipologia,
            colore: p.colore,
            altezzaMm: p.altezzaMm,
            larghezzaMm: p.larghezzaMm,
            prezzoBase: p.prezzoBase,
            coefficienteRicarico: 1,
          },
        });
        prodottiCreati++;
      } else {
        prodottiInvariati++;
      }
    }

    const modelli = modelliData as ModelloRow[];
    for (const m of modelli) {
      await prisma.modelloProdotto.upsert({
        where: { brandId_tipologia: { brandId: brand.id, tipologia: m.tipologia } },
        create: {
          brandId: brand.id,
          tipologia: m.tipologia,
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
          immagineUrl: m.immagineUrl ?? null,
          modalitaCalcolo: m.modalitaCalcolo,
          parametriCalcolo: m.parametriCalcolo,
        },
        update: {
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
          immagineUrl: m.immagineUrl ?? null,
          modalitaCalcolo: m.modalitaCalcolo,
          parametriCalcolo: m.parametriCalcolo,
        },
      });
    }

    return NextResponse.json({ ok: true, prodottiCreati, prodottiInvariati, modelliAggiornati: modelli.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

  const prodottiCount = await prisma.prodotto.count({
    where: { brandId: brand.id, OR: TIPOLOGIE_PREFIXES.map((p) => ({ tipologia: { startsWith: p } })) },
  });
  const modelliCount = await prisma.modelloProdotto.count({
    where: { brandId: brand.id, OR: TIPOLOGIE_PREFIXES.map((p) => ({ tipologia: { startsWith: p } })) },
  });

  return NextResponse.json({ ok: true, dryRun: true, prodottiCount, modelliCount });
}
