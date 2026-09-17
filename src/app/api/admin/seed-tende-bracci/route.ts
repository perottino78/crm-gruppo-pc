import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/tendabracci_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/tendabracci_modelli.json";
import optionaliData from "../../../../../prisma/seed-data/tendabracci_optional.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";
const GRUPPO = "TENDE A BRACCI SENZA CASSONETTO";

type ProdottoRow = { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number; prezzoBase: number };
type ModelloRow = { tipologia: string; descrizioneTecnica: string; famiglia: string; gruppo: string; immagineUrl?: string | null };
type OptionalRow = {
  categoria: string;
  nome: string;
  tipoPrezzo: string;
  valore: number;
  unita: string | null;
  sporgenzaMm: number | null;
  larghezzaMm: number | null;
  listino: string | null;
  note: string | null;
  gruppiApplicabili: string[];
};

// NOTA: usare match esatti (non startsWith) perché Prisma/Postgres compila startsWith in
// LIKE 'prefix%' senza escape del carattere '_' (che in SQL LIKE è un wildcard "1 carattere qualsiasi").
// "TENDABRACCI_" come prefisso quindi intercetta erroneamente anche "TENDABRACCICASS_..." (sezione con cassonetto).
const TIPOLOGIE_ESATTE = [
  "TENDABRACCI_PANAMA",
  "TENDABRACCI_MADRID",
  "TENDABRACCI_BILBAO",
  "TENDABRACCI_AMERICA",
  "TENDABRACCI_SAMBA",
  "TENDABRACCI_SAMBASMART",
];
const keyProdotto = (p: { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number }) =>
  `${p.tipologia}|${p.colore}|${p.altezzaMm}|${p.larghezzaMm}`;
const keyOptional = (o: { categoria: string; nome: string; listino: string | null }) => `${o.categoria}|${o.nome}|${o.listino ?? ""}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    const prodottiNuovi = prodottiData as ProdottoRow[];
    const prodottiEsistenti = await prisma.prodotto.findMany({
      where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_ESATTE } },
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
        },
        update: {
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
          immagineUrl: m.immagineUrl ?? null,
        },
      });
    }

    const optionaliNuovi = optionaliData as OptionalRow[];
    const optionaliEsistenti = await prisma.optional.findMany({
      where: { brandId: brand.id, gruppiApplicabili: { has: GRUPPO } },
    });
    const mappaOptional = new Map(optionaliEsistenti.map((o) => [keyOptional(o), o]));
    const chiaviNuove = new Set(optionaliNuovi.map(keyOptional));

    let optCreati = 0;
    let optAggiornati = 0;
    let optInvariati = 0;
    for (const o of optionaliNuovi) {
      const esistente = mappaOptional.get(keyOptional(o));
      if (!esistente) {
        await prisma.optional.create({
          data: {
            brandId: brand.id,
            categoria: o.categoria,
            nome: o.nome,
            tipoPrezzo: o.tipoPrezzo,
            valore: o.valore,
            unita: o.unita,
            sporgenzaMm: o.sporgenzaMm,
            larghezzaMm: o.larghezzaMm,
            listino: o.listino,
            note: o.note,
            gruppiApplicabili: o.gruppiApplicabili,
          },
        });
        optCreati++;
      } else if (
        esistente.valore !== o.valore ||
        esistente.tipoPrezzo !== o.tipoPrezzo ||
        esistente.listino !== o.listino ||
        JSON.stringify(esistente.gruppiApplicabili) !== JSON.stringify(o.gruppiApplicabili)
      ) {
        await prisma.optional.update({
          where: { id: esistente.id },
          data: { valore: o.valore, tipoPrezzo: o.tipoPrezzo, listino: o.listino, gruppiApplicabili: o.gruppiApplicabili },
        });
        optAggiornati++;
      } else {
        optInvariati++;
      }
    }

    // Rimuove i prodotti/optional del vecchio listino non più presenti nel nuovo catalogo 2026
    const prodottiDaRimuovere = prodottiEsistenti.filter((p) => !prodottiNuovi.some((n) => keyProdotto(n) === keyProdotto(p)));
    if (prodottiDaRimuovere.length > 0) {
      await prisma.prodotto.deleteMany({ where: { id: { in: prodottiDaRimuovere.map((p) => p.id) } } });
    }
    const optionaliDaRimuovere = optionaliEsistenti.filter((o) => !chiaviNuove.has(keyOptional(o)));
    if (optionaliDaRimuovere.length > 0) {
      await prisma.optional.deleteMany({ where: { id: { in: optionaliDaRimuovere.map((o) => o.id) } } });
    }

    return NextResponse.json({
      ok: true,
      prodottiCreati,
      prodottiAggiornati,
      prodottiInvariati,
      prodottiRimossi: prodottiDaRimuovere.length,
      modelliAggiornati: modelli.length,
      optCreati,
      optAggiornati,
      optInvariati,
      optRimossi: optionaliDaRimuovere.length,
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
    where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_ESATTE } },
  });
  const modelliCount = await prisma.modelloProdotto.count({
    where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_ESATTE } },
  });
  const modelliTipologie = (
    await prisma.modelloProdotto.findMany({
      where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_ESATTE } },
      select: { tipologia: true },
    })
  ).map((m) => m.tipologia);
  const optionaliCount = await prisma.optional.count({
    where: { brandId: brand.id, gruppiApplicabili: { has: GRUPPO } },
  });

  return NextResponse.json({ ok: true, dryRun: true, prodottiCount, modelliCount, modelliTipologie, optionaliCount });
}
