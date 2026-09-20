import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import optionaliData from "../../../../../prisma/seed-data/colori_struttura_optional.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";
const CATEGORIA = "Colore struttura";

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

// Colori struttura tende da sole 2026 (task #209, catalogo sezione 12 "Colori
// disponibili"): un Optional per ogni combinazione modello×colore disponibile
// (D=standard, Od=su ordinazione senza maggiorazione) o a maggiorazione
// percentuale (colori fuori cartella base, es. Corten/DB703). Lo scoping usa
// il campo "listino" impostato o alla tipologia esatta (modelli con una sola
// tipologia in DB) o alla chiave di famiglia "COLORE_*" prodotta da
// famigliaColoreStruttura() in src/lib/prodotti.ts (modelli con più
// tipologie/varianti che condividono la stessa tavolozza colori).
const keyOptional = (o: { categoria: string; nome: string; listino: string | null }) =>
  `${o.categoria}|${o.nome}|${o.listino ?? ""}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    const optionaliNuovi = optionaliData as OptionalRow[];
    const optionaliEsistenti = await prisma.optional.findMany({ where: { brandId: brand.id, categoria: CATEGORIA } });
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
        esistente.valore !== o.valore ||
        esistente.tipoPrezzo !== o.tipoPrezzo ||
        esistente.unita !== o.unita ||
        esistente.note !== o.note ||
        JSON.stringify(esistente.gruppiApplicabili) !== JSON.stringify(o.gruppiApplicabili)
      ) {
        await prisma.optional.update({
          where: { id: esistente.id },
          data: {
            valore: o.valore,
            tipoPrezzo: o.tipoPrezzo,
            unita: o.unita,
            note: o.note,
            gruppiApplicabili: o.gruppiApplicabili,
          },
        });
        aggiornati++;
      } else {
        invariati++;
      }
    }

    // Rimuove eventuali righe orfane (colore rimosso da un modello in un futuro aggiornamento catalogo)
    const orfani = optionaliEsistenti.filter((o) => !chiaviNuove.has(keyOptional(o)));
    for (const o of orfani) {
      await prisma.optional.delete({ where: { id: o.id } });
    }

    return NextResponse.json({ ok: true, creati, aggiornati, invariati, rimossi: orfani.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });
  const count = await prisma.optional.count({ where: { brandId: brand.id, categoria: CATEGORIA } });
  return NextResponse.json({ optionaliCount: count });
}
