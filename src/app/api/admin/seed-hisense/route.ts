import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/hisense_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/hisense_modelli.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "Solaris";

// Hisense — Condizionatori (Solaris): catalogo con prezzi di listino reali (colonna
// "Prezzo" del listino fornitore), gruppo merceologico "CONDIZIONATORI" separato dalla
// climatizzazione Lamborghini. Stesso pattern a nome/senza misura di Motori e Lamborghini
// (colore = variante commerciale, altezzaMm/larghezzaMm = 0), ma qui coefficienteRicarico: 1
// e prezzoBase già valorizzato — modificabile riga per riga dalla scheda modello nel CRM.
type ProdottoRow = { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number; prezzoBase: number; descrizione?: string };
type ModelloRow = { tipologia: string; descrizioneTecnica: string; famiglia: string; gruppo: string; immagineUrl?: string | null };

const TIPOLOGIA_PREFIX = "SOLARIS_HISENSE_";
const keyProdotto = (p: { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number }) =>
  `${p.tipologia}|${p.colore}|${p.altezzaMm}|${p.larghezzaMm}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand Solaris non trovato" }, { status: 400 });

    const prodottiNuovi = prodottiData as ProdottoRow[];
    const prodottiEsistenti = await prisma.prodotto.findMany({
      where: { brandId: brand.id, tipologia: { startsWith: TIPOLOGIA_PREFIX } },
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
            descrizione: p.descrizione ?? null,
            coefficienteRicarico: 1,
          },
        });
        prodottiCreati++;
      } else if (
        esistente.prezzoBase !== p.prezzoBase ||
        esistente.coefficienteRicarico !== 1 ||
        esistente.descrizione !== (p.descrizione ?? null)
      ) {
        await prisma.prodotto.update({
          where: { id: esistente.id },
          data: { prezzoBase: p.prezzoBase, coefficienteRicarico: 1, descrizione: p.descrizione ?? null },
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
        },
        update: {
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
          immagineUrl: m.immagineUrl ?? null,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      prodottiCreati,
      prodottiAggiornati,
      prodottiInvariati,
      modelliAggiornati: modelli.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
