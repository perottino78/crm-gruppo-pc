import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/cappottine_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/cappottine_modelli.json";
import optionaliData from "../../../../../prisma/seed-data/cappottine_optional.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";

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

// Tipologie gestite da questa route (match esatto, mai prefix/startsWith:
// Prisma compila startsWith in LIKE 'prefix%' dove "_" e' wildcard SQL per
// un singolo carattere, quindi un prefix con underscore puo' fare match
// involontari - vedi bug gia' corretto in seed-tende-bracci).
const TIPOLOGIE_GESTITE = [
  "BARLETTA35_4P3S", "BARLETTA35_5P4S", "BARLETTA35_6P5S",
  "BARLETTA50_4P3S", "BARLETTA50_5P4S", "BARLETTA50_6P5S",
  "BETA1002", "BETA1003",
  "CUPOLA35_COSTANTE_4P3S", "CUPOLA35_COSTANTE_5P4S", "CUPOLA35_COSTANTE_6P5S",
  "CUPOLA35_NONCOSTANTE_4P3S", "CUPOLA35_NONCOSTANTE_5P4S", "CUPOLA35_NONCOSTANTE_6P5S",
  "CUPOLA50_COSTANTE_4P3S", "CUPOLA50_COSTANTE_5P4S", "CUPOLA50_COSTANTE_6P5S",
  "CUPOLA50_NONCOSTANTE_4P3S", "CUPOLA50_NONCOSTANTE_5P4S", "CUPOLA50_NONCOSTANTE_6P5S",
  "DELTA_K35", "DELTA_K50",
  "GRADINI35", "GRADINI50",
  "PROLUNGATA35", "PROLUNGATA50",
  "STANDARD35_4P3S", "STANDARD35_5P4S", "STANDARD35_6P5S",
  "STANDARD50_4P3S", "STANDARD50_5P4S", "STANDARD50_6P5S",
  "VOGUE",
];

// Listini usati dagli Optional (famiglie collassate via listinoDiTipologia + le
// sotto-tipologie che referenziano se' stesse per la maggiorazione tessuto).
const LISTINI_GESTITI = [
  "BARLETTA", "BETA1002", "BETA1003", "CUPOLA", "DELTA_K35", "DELTA_K50",
  "GRADINI35", "GRADINI50", "PROLUNGATA35", "PROLUNGATA50",
  "STANDARD35", "STANDARD35_4P3S", "STANDARD35_5P4S", "STANDARD35_6P5S",
  "STANDARD50", "STANDARD50_4P3S", "STANDARD50_5P4S", "STANDARD50_6P5S",
  "VOGUE",
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

    // Prodotti (griglia prezzi)
    const prodottiNuovi = prodottiData as ProdottoRow[];
    const prodottiEsistenti = await prisma.prodotto.findMany({
      where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_GESTITE } },
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

    // Cleanup: rimuove prodotti orfani (es. vecchie righe BARLETTA/CUPOLA
    // flat, ora sostituite dalle sotto-tipologie 4P3S/5P4S/6P5S)
    const chiaviNuoveProd = new Set(prodottiNuovi.map(keyProdotto));
    const prodottiDaRimuovere = prodottiEsistenti.filter((p) => !chiaviNuoveProd.has(keyProdotto(p)));
    if (prodottiDaRimuovere.length > 0) {
      await prisma.prodotto.deleteMany({ where: { id: { in: prodottiDaRimuovere.map((p) => p.id) } } });
    }

    // Modelli (descrizione + immagine) - cleanup dei vecchi BARLETTA/CUPOLA flat
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
    const tipologieModelliNuovi = new Set(modelli.map((m) => m.tipologia));
    const modelliOrfani = await prisma.modelloProdotto.findMany({
      where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_GESTITE }, NOT: { tipologia: { in: Array.from(tipologieModelliNuovi) } } },
    });
    // I modelli "vecchi" con tipologia flat BARLETTA/CUPOLA non sono in TIPOLOGIE_GESTITE
    // (che contiene solo le nuove sotto-tipologie), quindi li cerchiamo esplicitamente per nome.
    const modelliFlatDaRimuovere = await prisma.modelloProdotto.findMany({
      where: { brandId: brand.id, tipologia: { in: ["BARLETTA", "CUPOLA"] } },
    });
    const idModelliDaRimuovere = [...modelliOrfani, ...modelliFlatDaRimuovere].map((m) => m.id);
    if (idModelliDaRimuovere.length > 0) {
      await prisma.modelloProdotto.deleteMany({ where: { id: { in: idModelliDaRimuovere } } });
    }

    // Optional (Motorizzazione/Supplementi + Maggiorazione tessuto)
    const optionaliNuovi = optionaliData as OptionalRow[];
    const optionaliEsistenti = await prisma.optional.findMany({
      where: { brandId: brand.id, listino: { in: LISTINI_GESTITI } },
    });
    const mappaOptional = new Map(optionaliEsistenti.map((o) => [keyOptional(o), o]));

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
        esistente.unita !== o.unita ||
        esistente.note !== o.note ||
        JSON.stringify(esistente.gruppiApplicabili) !== JSON.stringify(o.gruppiApplicabili)
      ) {
        await prisma.optional.update({
          where: { id: esistente.id },
          data: { valore: o.valore, tipoPrezzo: o.tipoPrezzo, unita: o.unita, note: o.note, gruppiApplicabili: o.gruppiApplicabili },
        });
        optAggiornati++;
      } else {
        optInvariati++;
      }
    }
    const chiaviNuoveOpt = new Set(optionaliNuovi.map(keyOptional));
    const optionaliDaRimuovere = optionaliEsistenti.filter((o) => !chiaviNuoveOpt.has(keyOptional(o)));
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
      modelliRimossi: idModelliDaRimuovere.length,
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

  const prodottiCount = await prisma.prodotto.count({ where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_GESTITE } } });
  const modelliCount = await prisma.modelloProdotto.count({ where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_GESTITE } } });
  const modelliFlatResidui = await prisma.modelloProdotto.count({ where: { brandId: brand.id, tipologia: { in: ["BARLETTA", "CUPOLA"] } } });
  const optionaliCount = await prisma.optional.count({ where: { brandId: brand.id, listino: { in: LISTINI_GESTITI } } });
  const optionaliByListino = await prisma.optional.groupBy({
    by: ["listino"],
    where: { brandId: brand.id, listino: { in: LISTINI_GESTITI } },
    _count: { _all: true },
  });

  const debugListino = req.nextUrl.searchParams.get("debugListino");
  let debugRows: unknown = undefined;
  if (debugListino) {
    debugRows = await prisma.optional.findMany({
      where: { brandId: brand.id, listino: debugListino },
      select: { id: true, categoria: true, nome: true, valore: true, tipoPrezzo: true, unita: true, note: true, gruppiApplicabili: true },
      orderBy: [{ categoria: "asc" }, { nome: "asc" }],
    });
  }

  return NextResponse.json({ ok: true, dryRun: true, prodottiCount, modelliCount, modelliFlatResidui, optionaliCount, optionaliByListino, debugRows });
}
