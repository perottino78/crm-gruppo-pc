import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/posa_opera_ws_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/posa_opera_ws_modelli.json";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
// A differenza di seed-posa-opera (che scrive gli STESSI dati come Optional sotto
// brand P&C, per agganciare la posa a una vendita di prodotto reale), questa route
// scrive lo stesso listino come catalogo "a scelta nome" (senza misura, vedi
// haMisura/variantiPerTipologia in preventivi/[id]/page.tsx) sotto il brand
// "Work & Services", cosi' un preventivo con quel brand puo' scegliere le voci di
// rilievo/posa/smontaggio direttamente come prodotto a listino invece di scriverle
// a mano come riga di testo libero (che non porta prezzo ne' tracciabilita').
const BRAND = "Work & Services";

type ProdottoRow = {
  tipologia: string;
  colore: string;
  altezzaMm: number;
  larghezzaMm: number;
  prezzoBase: number;
  descrizione: string | null;
};

type ModelloRow = {
  tipologia: string;
  famiglia: string;
  gruppo: string;
  immagineUrl?: string | null;
};

const keyProdotto = (p: { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number }) =>
  `${p.tipologia}|${p.colore}|${p.altezzaMm}|${p.larghezzaMm}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) {
      return NextResponse.json({ error: `brand ${BRAND} non trovato` }, { status: 400 });
    }

    const prodottiNuovi = prodottiData as ProdottoRow[];
    const prodottiEsistenti = await prisma.prodotto.findMany({ where: { brandId: brand.id } });
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
            descrizione: p.descrizione,
            coefficienteRicarico: 1,
          },
        });
        prodottiCreati++;
      } else if (
        esistente.prezzoBase !== p.prezzoBase ||
        esistente.descrizione !== p.descrizione ||
        esistente.coefficienteRicarico !== 1
      ) {
        await prisma.prodotto.update({
          where: { id: esistente.id },
          data: { prezzoBase: p.prezzoBase, descrizione: p.descrizione, coefficienteRicarico: 1 },
        });
        prodottiAggiornati++;
      } else {
        prodottiInvariati++;
      }
    }

    const chiaviNuove = new Set(prodottiNuovi.map((p) => keyProdotto(p)));
    const prodottiDaRimuovere = prodottiEsistenti.filter((p) => !chiaviNuove.has(keyProdotto(p)));
    let prodottiRimossi = 0;
    for (const p of prodottiDaRimuovere) {
      await prisma.rigaPreventivo.deleteMany({ where: { prodottoId: p.id } });
      await prisma.prodotto.delete({ where: { id: p.id } });
      prodottiRimossi++;
    }

    const modelli = modelliData as ModelloRow[];
    let modelliAggiornati = 0;
    for (const m of modelli) {
      await prisma.modelloProdotto.upsert({
        where: { brandId_tipologia: { brandId: brand.id, tipologia: m.tipologia } },
        create: {
          brandId: brand.id,
          tipologia: m.tipologia,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
          immagineUrl: m.immagineUrl ?? null,
        },
        update: {
          famiglia: m.famiglia,
          gruppo: m.gruppo,
          immagineUrl: m.immagineUrl ?? null,
        },
      });
      modelliAggiornati++;
    }

    const tipologieNuove = new Set(modelli.map((m) => m.tipologia));
    const modelliEsistenti = await prisma.modelloProdotto.findMany({ where: { brandId: brand.id } });
    const modelliDaRimuovere = modelliEsistenti.filter((m) => !tipologieNuove.has(m.tipologia));
    let modelliRimossi = 0;
    for (const m of modelliDaRimuovere) {
      await prisma.modelloProdotto.delete({ where: { id: m.id } });
      modelliRimossi++;
    }

    return NextResponse.json({
      ok: true,
      prodottiCreati,
      prodottiAggiornati,
      prodottiInvariati,
      prodottiRimossi,
      modelliAggiornati,
      modelliRimossi,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: `brand ${BRAND} non trovato` }, { status: 400 });

  const prodotti = await prisma.prodotto.count({ where: { brandId: brand.id } });
  const modelli = await prisma.modelloProdotto.count({ where: { brandId: brand.id } });

  return NextResponse.json({ ok: true, dryRun: true, prodotti, modelli });
}
