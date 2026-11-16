import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/zenith_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/zenith_modelli.json";
import { allineaOptionalSerramenti } from "@/lib/listini/allinea-optional";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";
const GRUPPO = "SERRAMENTI";

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

const TIPOLOGIE_PREFIXES = ["ZENITH_"];
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
    let prodottiAggiornati = 0;
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
      } else if (esistente.prezzoBase !== p.prezzoBase || esistente.coefficienteRicarico !== 1) {
        await prisma.prodotto.update({
          where: { id: esistente.id },
          data: { prezzoBase: p.prezzoBase, coefficienteRicarico: 1 },
        });
        prodottiAggiornati++;
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

    // optional: dal modulo src/lib/listini/zenith.ts (colore esterno/interno, vetri, accessori, lavorazioni), solo quelli che mancano;
    // le vecchie voci del primo caricamento (zenith_optional.json) restano spente
    const { creati: optCreati, spenti: optSpenti } = await allineaOptionalSerramenti();

    return NextResponse.json({
      ok: true,
      prodottiCreati,
      prodottiAggiornati,
      prodottiInvariati,
      modelliAggiornati: modelli.length,
      optCreati,
      optSpenti,
    });
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
  const optionaliCount = await prisma.optional.count({
    where: { brandId: brand.id, gruppiApplicabili: { has: GRUPPO } },
  });

  return NextResponse.json({ ok: true, dryRun: true, prodottiCount, modelliCount, optionaliCount });
}
