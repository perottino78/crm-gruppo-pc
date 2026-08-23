import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/purafonte_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/purafonte_modelli.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "Purafonte";

type ProdottoRow = {
  tipologia: string;
  colore: string;
  altezzaMm: number;
  larghezzaMm: number;
  prezzoBase: number;
  descrizione: string;
};

type ModelloRow = {
  tipologia: string;
  immagineUrl: string;
  descrizioneTecnica: string;
  famiglia: string;
  gruppo: string;
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
      return NextResponse.json({ error: "brand Purafonte non trovato, esegui prima il seed principale" }, { status: 400 });
    }

    // upsert non distruttivo dei prodotti (catalogo flat: un codice = un prezzo, niente fasce di misura)
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
      } else if (esistente.prezzoBase !== p.prezzoBase || esistente.descrizione !== p.descrizione || esistente.coefficienteRicarico !== 1) {
        await prisma.prodotto.update({
          where: { id: esistente.id },
          data: { prezzoBase: p.prezzoBase, descrizione: p.descrizione, coefficienteRicarico: 1 },
        });
        prodottiAggiornati++;
      } else {
        prodottiInvariati++;
      }
    }

    // upsert delle schede tecniche (immagine reale estratta dal listino + gruppo merceologico)
    const modelli = modelliData as ModelloRow[];
    let modelliAggiornati = 0;
    for (const m of modelli) {
      await prisma.modelloProdotto.upsert({
        where: { brandId_tipologia: { brandId: brand.id, tipologia: m.tipologia } },
        create: {
          brandId: brand.id,
          tipologia: m.tipologia,
          immagineUrl: m.immagineUrl,
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
        },
        update: {
          immagineUrl: m.immagineUrl,
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
        },
      });
      modelliAggiornati++;
    }

    return NextResponse.json({ ok: true, prodottiCreati, prodottiAggiornati, prodottiInvariati, modelliAggiornati });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
