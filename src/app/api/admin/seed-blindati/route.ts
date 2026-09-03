import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/blindati_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/blindati_modelli.json";
import optionaliData from "../../../../../prisma/seed-data/blindati_optional.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";
const GRUPPO = "BLINDATI";

type ProdottoRow = { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number; prezzoBase: number };
type ModelloRow = {
  tipologia: string;
  descrizioneTecnica: string;
  famiglia: string;
  gruppo: string;
  immagineUrl?: string | null;
  modalitaCalcolo: string;
  parametriCalcolo: Record<string, number>;
};
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

const TIPOLOGIE_PREFIXES = ["BLINDATI_"];
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
      where: { brandId: brand.id, OR: TIPOLOGIE_PREFIXES.map((p) => ({ tipologia: { startsWith: p } })) },
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
          modalitaCalcolo: m.modalitaCalcolo,
          parametriCalcolo: m.parametriCalcolo,
        },
        update: {
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
          immagineUrl: m.immagineUrl ?? null,
          modalitaCalcolo: m.modalitaCalcolo,
          parametriCalcolo: m.parametriCalcolo,
        },
      });
    }

    const optionaliNuovi = optionaliData as OptionalRow[];
    const optionaliEsistenti = await prisma.optional.findMany({
      where: { brandId: brand.id, gruppiApplicabili: { has: GRUPPO } },
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
        esistente.note !== o.note ||
        JSON.stringify(esistente.gruppiApplicabili) !== JSON.stringify(o.gruppiApplicabili)
      ) {
        await prisma.optional.update({
          where: { id: esistente.id },
          data: { valore: o.valore, tipoPrezzo: o.tipoPrezzo, note: o.note, gruppiApplicabili: o.gruppiApplicabili },
        });
        optAggiornati++;
      } else {
        optInvariati++;
      }
    }

    return NextResponse.json({
      ok: true,
      prodottiCreati,
      prodottiAggiornati,
      prodottiInvariati,
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

  const prodottiCount = await prisma.prodotto.count({
    where: { brandId: brand.id, OR: TIPOLOGIE_PREFIXES.map((p) => ({ tipologia: { startsWith: p } })) },
  });
  const modelliCount = await prisma.modelloProdotto.count({
    where: { brandId: brand.id, OR: TIPOLOGIE_PREFIXES.map((p) => ({ tipologia: { startsWith: p } })) },
  });
  const optionaliCount = await prisma.optional.count({
    where: { brandId: brand.id, gruppiApplicabili: { has: GRUPPO } },
  });

  return NextResponse.json({ ok: true, dryRun: true, prodottiCount, modelliCount, optionaliCount });
}
