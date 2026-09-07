import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import optionaliData from "../../../../../prisma/seed-data/accessori_zanzariere_optional.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";
// Accessori generici, Automazioni e Maggiorazioni colore per tutte le zanzariere
// P&C (ante ZPC_, Linea Uragano, verticali a rullo), che condividono il gruppo
// unico "ZANZARIERE_PC". Questi optional non sono legati a una singola famiglia
// (a differenza degli optional propri di ciascuna route seed-zanzariere-*), quindi
// usano gruppiApplicabili invece di listino per lo scoping in visualizzazione — le
// altre 3 route seed condivise sul gruppo (seed-zanzariere-pc, seed-uragano,
// seed-zanzariere-verticali) non usano mai gruppiApplicabili ne' listino:null sui
// propri optional, quindi la combinazione qui sotto non puo' entrare in collisione
// con righe di quelle route.
const GRUPPO_ZANZARIERE = "ZANZARIERE_PC";

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
  finituraApplicabile?: string | null;
};

const keyOptional = (o: { categoria: string; nome: string; listino: string | null; finituraApplicabile?: string | null }) =>
  `${o.categoria}|${o.nome}|${o.listino ?? ""}|${o.finituraApplicabile ?? ""}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    const optionaliNuovi = optionaliData as OptionalRow[];
    const optionaliEsistenti = await prisma.optional.findMany({
      where: { brandId: brand.id, gruppiApplicabili: { has: GRUPPO_ZANZARIERE }, listino: null },
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
            finituraApplicabile: o.finituraApplicabile ?? null,
          },
        });
        optCreati++;
      } else if (
        esistente.valore !== o.valore ||
        esistente.tipoPrezzo !== o.tipoPrezzo ||
        esistente.note !== o.note ||
        esistente.finituraApplicabile !== (o.finituraApplicabile ?? null) ||
        JSON.stringify(esistente.gruppiApplicabili) !== JSON.stringify(o.gruppiApplicabili)
      ) {
        await prisma.optional.update({
          where: { id: esistente.id },
          data: {
            valore: o.valore,
            tipoPrezzo: o.tipoPrezzo,
            note: o.note,
            gruppiApplicabili: o.gruppiApplicabili,
            finituraApplicabile: o.finituraApplicabile ?? null,
          },
        });
        optAggiornati++;
      } else {
        optInvariati++;
      }
    }

    const chiaviNuove = new Set(optionaliNuovi.map((o) => keyOptional(o)));
    const optionaliDaRimuovere = optionaliEsistenti.filter((o) => !chiaviNuove.has(keyOptional(o)));
    let optRimossi = 0;
    for (const o of optionaliDaRimuovere) {
      await prisma.rigaOptional.deleteMany({ where: { optionalId: o.id } });
      await prisma.optional.delete({ where: { id: o.id } });
      optRimossi++;
    }

    return NextResponse.json({ ok: true, optCreati, optAggiornati, optInvariati, optRimossi });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

  const optionaliCount = await prisma.optional.count({
    where: { brandId: brand.id, gruppiApplicabili: { has: GRUPPO_ZANZARIERE }, listino: null },
  });

  return NextResponse.json({ ok: true, dryRun: true, optionaliCount });
}
