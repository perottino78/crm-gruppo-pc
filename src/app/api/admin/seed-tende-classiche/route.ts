import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/tendeclassiche_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/tendeclassiche_modelli.json";
import optionaliData from "../../../../../prisma/seed-data/tendeclassiche_optional.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";
const GRUPPO = "TENDE CLASSICHE";

// Sezione 5 2026: nuovo gruppo "Tende classiche" (catalogo 2026, pag. 86-93).
const TIPOLOGIE_GESTITE = [
  "TENDABRACCI_CLASSIQUE",
  "TENDABRACCI_LEUCA",
  "TENDABRACCI_RETRO6000_ROUND",
  "TENDABRACCI_RETRO6000_SENZACASS",
];

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

const keyProdotto = (p: { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number }) =>
  `${p.tipologia}|${p.colore}|${p.altezzaMm}|${p.larghezzaMm}`;
const keyOptional = (o: { categoria: string; nome: string; listino: string | null }) => `${o.categoria}|${o.nome}|${o.listino ?? ""}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    // --- Prodotti ---
    const prodottiNuovi = prodottiData as ProdottoRow[];
    const prodottiEsistenti = await prisma.prodotto.findMany({
      where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_GESTITE } },
    });
    const mappaProdotti = new Map(prodottiEsistenti.map((p) => [keyProdotto(p), p]));

    const prodDaCreare: ProdottoRow[] = [];
    const prodDaAggiornare: { id: string; p: ProdottoRow }[] = [];
    let prodInvariati = 0;
    for (const p of prodottiNuovi) {
      const esistente = mappaProdotti.get(keyProdotto(p));
      if (!esistente) {
        prodDaCreare.push(p);
      } else if (esistente.prezzoBase !== p.prezzoBase || esistente.coefficienteRicarico !== 1) {
        prodDaAggiornare.push({ id: esistente.id, p });
      } else {
        prodInvariati++;
      }
    }
    let prodottiCreati = 0;
    if (prodDaCreare.length > 0) {
      const res = await prisma.prodotto.createMany({
        data: prodDaCreare.map((p) => ({
          brandId: brand.id,
          tipologia: p.tipologia,
          colore: p.colore,
          altezzaMm: p.altezzaMm,
          larghezzaMm: p.larghezzaMm,
          prezzoBase: p.prezzoBase,
          coefficienteRicarico: 1,
        })),
        skipDuplicates: true,
      });
      prodottiCreati = res.count;
    }
    let prodottiAggiornati = 0;
    for (const { id, p } of prodDaAggiornare) {
      await prisma.prodotto.update({ where: { id }, data: { prezzoBase: p.prezzoBase, coefficienteRicarico: 1 } });
      prodottiAggiornati++;
    }

    // --- Modelli ---
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

    // --- Optional ---
    const optionaliNuovi = optionaliData as OptionalRow[];
    const optionaliEsistenti = await prisma.optional.findMany({
      where: { brandId: brand.id, listino: { in: TIPOLOGIE_GESTITE } },
    });
    const mappaOptional = new Map(optionaliEsistenti.map((o) => [keyOptional(o), o]));

    const optDaCreare: OptionalRow[] = [];
    const optDaAggiornare: { id: string; o: OptionalRow }[] = [];
    let optInvariati = 0;
    for (const o of optionaliNuovi) {
      const esistente = mappaOptional.get(keyOptional(o));
      if (!esistente) {
        optDaCreare.push(o);
      } else if (
        esistente.valore !== o.valore ||
        esistente.tipoPrezzo !== o.tipoPrezzo ||
        esistente.note !== o.note ||
        JSON.stringify(esistente.gruppiApplicabili) !== JSON.stringify(o.gruppiApplicabili)
      ) {
        optDaAggiornare.push({ id: esistente.id, o });
      } else {
        optInvariati++;
      }
    }
    let optCreati = 0;
    if (optDaCreare.length > 0) {
      const res = await prisma.optional.createMany({
        data: optDaCreare.map((o) => ({
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
        })),
        skipDuplicates: true,
      });
      optCreati = res.count;
    }
    let optAggiornati = 0;
    for (const { id, o } of optDaAggiornare) {
      await prisma.optional.update({
        where: { id },
        data: { valore: o.valore, tipoPrezzo: o.tipoPrezzo, note: o.note, gruppiApplicabili: o.gruppiApplicabili },
      });
      optAggiornati++;
    }

    return NextResponse.json({
      ok: true,
      prodottiCreati,
      prodottiAggiornati,
      prodottiInvariati: prodInvariati,
      modelliAggiornati: modelli.length,
      optCreati,
      optAggiornati,
      optInvariati,
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
  const optionaliCount = await prisma.optional.count({ where: { brandId: brand.id, listino: { in: TIPOLOGIE_GESTITE } } });
  return NextResponse.json({ prodottiCount, modelliCount, optionaliCount });
}
