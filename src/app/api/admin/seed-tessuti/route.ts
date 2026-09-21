import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import optionaliData from "../../../../../prisma/seed-data/tessuti_tempotest_optional.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";

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

// Tessuti Tempotest 2025 per le tende da sole (task #210): un Optional per ogni
// codice tessuto (~530), categoria "Tessuto - <Collezione>", scoping via
// gruppiApplicabili (tutti i gruppi di tende da sole in tessuto). Lo scoping non
// usa "listino" (lasciato null) perché il tessuto non dipende dal modello/
// tipologia specifica ma solo dal gruppo prodotto, a differenza dei colori
// struttura in seed-colori-struttura.
const keyOptional = (o: { categoria: string; nome: string }) => `${o.categoria}|${o.nome}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    const optionaliNuovi = optionaliData as OptionalRow[];
    const optionaliEsistenti = await prisma.optional.findMany({
      where: { brandId: brand.id, categoria: { startsWith: "Tessuto - " } },
    });
    const mappaOptional = new Map(optionaliEsistenti.map((o) => [keyOptional(o), o]));
    const chiaviNuove = new Set(optionaliNuovi.map(keyOptional));

    let creati = 0;
    let aggiornati = 0;
    let invariati = 0;
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
        creati++;
      } else if (
        esistente.note !== o.note ||
        JSON.stringify(esistente.gruppiApplicabili) !== JSON.stringify(o.gruppiApplicabili)
      ) {
        await prisma.optional.update({
          where: { id: esistente.id },
          data: { note: o.note, gruppiApplicabili: o.gruppiApplicabili },
        });
        aggiornati++;
      } else {
        invariati++;
      }
    }

    const orfani = optionaliEsistenti.filter((o) => !chiaviNuove.has(keyOptional(o)));
    for (const o of orfani) {
      await prisma.optional.delete({ where: { id: o.id } });
    }

    return NextResponse.json({ ok: true, creati, aggiornati, invariati, rimossi: orfani.length, totale: optionaliNuovi.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });
  const count = await prisma.optional.count({ where: { brandId: brand.id, categoria: { startsWith: "Tessuto - " } } });
  return NextResponse.json({ optionaliCount: count });
}
