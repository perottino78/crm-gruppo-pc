import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import optionaliData from "../../../../../prisma/seed-data/optional_illuminazione.json";

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
  note: string | null;
  gruppiApplicabili: string[];
};

// nessun listino specifico: disponibile su tutte le tipologie outdoor P&C (come gli optional con listino=null)
const keyOptional = (o: { categoria: string; nome: string }) => `${o.categoria}|${o.nome}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    const optionaliNuovi = optionaliData as OptionalRow[];
    const optionaliEsistenti = await prisma.optional.findMany({ where: { brandId: brand.id, listino: null } });
    const mappaOptional = new Map(optionaliEsistenti.map((o) => [keyOptional(o), o]));

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
            note: o.note,
            gruppiApplicabili: o.gruppiApplicabili,
          },
        });
        creati++;
      } else if (
        esistente.valore !== o.valore ||
        esistente.note !== o.note ||
        JSON.stringify(esistente.gruppiApplicabili) !== JSON.stringify(o.gruppiApplicabili)
      ) {
        await prisma.optional.update({
          where: { id: esistente.id },
          data: { valore: o.valore, note: o.note, gruppiApplicabili: o.gruppiApplicabili },
        });
        aggiornati++;
      } else {
        invariati++;
      }
    }

    return NextResponse.json({ ok: true, creati, aggiornati, invariati });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
