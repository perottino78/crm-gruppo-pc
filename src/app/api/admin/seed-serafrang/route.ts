import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import gridsData from "../../../../../prisma/seed-data/serafrang_grids.json";
import modelliData from "../../../../../prisma/seed-data/serafrang_modelli.json";
import optionaliData from "../../../../../prisma/seed-data/serafrang_optional.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";
const COLORE = "Standard";

type OptionalRow = {
  categoria: string; nome: string; tipoPrezzo: string; valore: number; unita: string | null;
  sporgenzaMm: number | null; larghezzaMm: number | null; listino: string | null; note: string | null;
  immagineUrl: string | null; gruppiApplicabili: string[];
};

export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    // Prodotti (griglie): rimpiazza interamente le tipologie SERAFRANG_
    const grids = gridsData as unknown as Record<string, [number, number, number][]>;
    const del = await prisma.prodotto.deleteMany({ where: { brandId: brand.id, tipologia: { startsWith: "SERAFRANG_" } } });
    let creati = 0;
    for (const [tipologia, rows] of Object.entries(grids)) {
      const data = rows.map(([h, l, p]) => ({
        brandId: brand.id, tipologia, colore: COLORE, altezzaMm: h, larghezzaMm: l, prezzoBase: p, coefficienteRicarico: 1,
      }));
      for (let i = 0; i < data.length; i += 5000) {
        const r = await prisma.prodotto.createMany({ data: data.slice(i, i + 5000), skipDuplicates: true });
        creati += r.count;
      }
    }

    // Modelli
    for (const m of modelliData as { tipologia: string; descrizioneTecnica: string; famiglia: string; gruppo: string; immagineUrl: string }[]) {
      await prisma.modelloProdotto.upsert({
        where: { brandId_tipologia: { brandId: brand.id, tipologia: m.tipologia } },
        create: { brandId: brand.id, ...m },
        update: { descrizioneTecnica: m.descrizioneTecnica, famiglia: m.famiglia, gruppo: m.gruppo, immagineUrl: m.immagineUrl },
      });
    }

    // I vecchi optional del Frangisole Verticale (listino null) vengono vincolati al loro listino
    const vincolati = await prisma.optional.updateMany({
      where: { brandId: brand.id, listino: null, gruppiApplicabili: { has: "FRANGISOLE" } },
      data: { listino: "FRANGISOLE_VERT" },
    });

    // Optional Seraplastic: crea o aggiorna (non cancella, per non spezzare righe preventivo esistenti)
    const opts = optionaliData as OptionalRow[];
    const esist = await prisma.optional.findMany({ where: { brandId: brand.id, listino: { startsWith: "SF:" } } });
    const mappa = new Map(esist.map((e) => [`${e.categoria}|${e.nome}|${e.listino}`, e]));
    let optCreati = 0, optAggiornati = 0;
    for (const x of opts) {
      const e = mappa.get(`${x.categoria}|${x.nome}|${x.listino}`);
      if (!e) { await prisma.optional.create({ data: { brandId: brand.id, ...x } }); optCreati++; }
      else { await prisma.optional.update({ where: { id: e.id }, data: { tipoPrezzo: x.tipoPrezzo, valore: x.valore, unita: x.unita, note: x.note, immagineUrl: x.immagineUrl, gruppiApplicabili: x.gruppiApplicabili } }); optAggiornati++; }
    }

    return NextResponse.json({ ok: true, eliminati: del.count, prodottiCreati: creati, modelli: (modelliData as unknown[]).length, optionalVincolati: vincolati.count, optCreati, optAggiornati });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
