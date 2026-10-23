import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import optionaliData from "../../../../../prisma/seed-data/posa_opera_optional.json";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";
// Rilievi e posa in opera del subappaltatore Work&Services S.R.L. (listini "Pose
// Pergole/Vetrate" e "Pose Serramenti/Tende da sole" 2026). Sono optional condivisi
// tra molti gruppi prodotto esistenti (PERGOLE, BIOCLIMATICA, VETRATE*, SERRAMENTI,
// PORTE INTERNE, BLINDATI, TAPPARELLE, PERSIANE, KOPEN, CANCELLI, ZANZARIERE_*,
// PENSILINE, TENDE*, CAPPOTTINE, GIARDINO E PATIO, LINEA ZIP), molti dei quali hanno
// gia' propri optional condivisi con listino:null (es. accessori zanzariere). Per
// evitare qualunque collisione in lettura/cleanup con quegli optional non correlati,
// non filtriamo "esistenti" per gruppiApplicabili+listino come nelle altre route
// condivise: ogni riga di questo listino ha invece una categoria che termina sempre
// con il marcatore " (Work&Service)", ed e' quel marcatore (controllato in JS, non in
// query) a delimitare in modo sicuro l'insieme di righe di competenza di questa route.
const MARCATORE = " (Work&Service)";

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

const keyOptional = (o: { categoria: string; nome: string; listino: string | null }) =>
  `${o.categoria}|${o.nome}|${o.listino ?? ""}`;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    const optionaliNuovi = optionaliData as OptionalRow[];

    const tuttiOptionaliBrand = await prisma.optional.findMany({ where: { brandId: brand.id } });
    const optionaliEsistenti = tuttiOptionaliBrand.filter((o) => o.categoria.endsWith(MARCATORE));
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
          data: {
            valore: o.valore,
            tipoPrezzo: o.tipoPrezzo,
            unita: o.unita,
            note: o.note,
            gruppiApplicabili: o.gruppiApplicabili,
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

  const tutti = await prisma.optional.findMany({ where: { brandId: brand.id } });
  const optionaliCount = tutti.filter((o) => o.categoria.endsWith(MARCATORE)).length;

  return NextResponse.json({ ok: true, dryRun: true, optionaliCount });
}
