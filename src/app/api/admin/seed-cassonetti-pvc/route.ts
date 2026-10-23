import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/cassonettipvc_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/cassonettipvc_modelli.json";
import optionaliData from "../../../../../prisma/seed-data/cassonettipvc_optional.json";

// Cassonetti PVC da restauro (profondita' fino a 147 mm e da 147 a 272 mm): listino
// 2022 gia' in prezzo di vendita (coefficiente 1), griglia altezza x larghezza in mm;
// le celle vuote del fornitore restano vuote (il preventivo usa la fascia superiore).
// Pellicolati +30%. Idempotente: crea e aggiorna, non cancella mai.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";
const PREFISSO = "CASSONETTOPVC_";
const LISTINO = "CASSONETTOPVC";

type ProdottoRow = { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number; prezzoBase: number };
type ModelloRow = { tipologia: string; immagineUrl: string | null; descrizioneTecnica: string; famiglia: string; gruppo: string };
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
const keyOptional = (o: { categoria: string; nome: string }) => `${o.categoria}|${o.nome}`;

export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    const prodotti = prodottiData as ProdottoRow[];
    const esistenti = await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: PREFISSO } } });
    const mappa = new Map(esistenti.map((p) => [keyProdotto(p), p]));
    const daCreare: ProdottoRow[] = [];
    let prodottiAggiornati = 0;
    for (const p of prodotti) {
      const e = mappa.get(keyProdotto(p));
      if (!e) daCreare.push(p);
      else if (e.prezzoBase !== p.prezzoBase || e.coefficienteRicarico !== 1) {
        await prisma.prodotto.update({ where: { id: e.id }, data: { prezzoBase: p.prezzoBase, coefficienteRicarico: 1 } });
        prodottiAggiornati++;
      }
    }
    if (daCreare.length > 0) {
      await prisma.prodotto.createMany({
        data: daCreare.map((p) => ({ brandId: brand.id, ...p, coefficienteRicarico: 1 })),
        skipDuplicates: true,
      });
    }

    for (const m of modelliData as ModelloRow[]) {
      const dati = { immagineUrl: m.immagineUrl, descrizioneTecnica: m.descrizioneTecnica, famiglia: m.famiglia, gruppo: m.gruppo };
      await prisma.modelloProdotto.upsert({
        where: { brandId_tipologia: { brandId: brand.id, tipologia: m.tipologia } },
        create: { brandId: brand.id, tipologia: m.tipologia, ...dati },
        update: dati,
      });
    }

    const optionali = optionaliData as OptionalRow[];
    const optEsistenti = await prisma.optional.findMany({ where: { brandId: brand.id, listino: LISTINO } });
    const mappaOpt = new Map(optEsistenti.map((o) => [keyOptional(o), o]));
    let optCreati = 0;
    let optAggiornati = 0;
    for (const o of optionali) {
      const e = mappaOpt.get(keyOptional(o));
      if (!e) {
        await prisma.optional.create({ data: { brandId: brand.id, ...o } });
        optCreati++;
      } else if (e.valore !== o.valore || e.tipoPrezzo !== o.tipoPrezzo || e.unita !== o.unita || e.note !== o.note) {
        await prisma.optional.update({
          where: { id: e.id },
          data: { valore: o.valore, tipoPrezzo: o.tipoPrezzo, unita: o.unita, note: o.note, gruppiApplicabili: o.gruppiApplicabili },
        });
        optAggiornati++;
      }
    }

    return NextResponse.json({
      ok: true,
      prodottiCreati: daCreare.length,
      prodottiAggiornati,
      modelli: (modelliData as ModelloRow[]).length,
      optCreati,
      optAggiornati,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });
  const prodottiCount = await prisma.prodotto.count({ where: { brandId: brand.id, tipologia: { startsWith: PREFISSO } } });
  const optionalCount = await prisma.optional.count({ where: { brandId: brand.id, listino: LISTINO } });
  return NextResponse.json({ ok: true, dryRun: true, prodottiCount, optionalCount });
}
