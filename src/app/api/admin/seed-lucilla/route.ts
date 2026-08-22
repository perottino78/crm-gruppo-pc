import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/lucilla_prodotti.json";
import optionaliData from "../../../../../prisma/seed-data/lucilla_optionals.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

type ProdottoRow = {
  tipologia: string;
  colore: string;
  altezzaMm: number;
  larghezzaMm: number;
  prezzoBase: number;
};

type OptionalRow = {
  categoria: string;
  nome: string;
  tipoPrezzo: string;
  valore: number;
  unita: string | null;
  sporgenzaMm: number | null;
  larghezzaMm: number | null;
  note: string | null;
};

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
  if (!brand) {
    return NextResponse.json({ error: "brand P&C non trovato, esegui prima il seed principale" }, { status: 400 });
  }

  // idempotenza: rimuove eventuali importazioni Lucilla precedenti
  await prisma.prodotto.deleteMany({ where: { brandId: brand.id, tipologia: { startsWith: "LUCILLA_" } } });
  await prisma.optional.deleteMany({ where: { brandId: brand.id } });

  const prodotti = prodottiData as ProdottoRow[];
  const optionali = optionaliData as OptionalRow[];

  let prodottiCreati = 0;
  for (let i = 0; i < prodotti.length; i += 500) {
    const chunk = prodotti.slice(i, i + 500).map((p) => ({
      brandId: brand.id,
      tipologia: p.tipologia,
      colore: p.colore,
      altezzaMm: p.altezzaMm,
      larghezzaMm: p.larghezzaMm,
      prezzoBase: p.prezzoBase,
      coefficienteRicarico: 1,
    }));
    const res = await prisma.prodotto.createMany({ data: chunk });
    prodottiCreati += res.count;
  }

  let optionaliCreati = 0;
  for (let i = 0; i < optionali.length; i += 500) {
    const chunk = optionali.slice(i, i + 500).map((o) => ({
      brandId: brand.id,
      categoria: o.categoria,
      nome: o.nome,
      tipoPrezzo: o.tipoPrezzo,
      valore: o.valore,
      unita: o.unita,
      sporgenzaMm: o.sporgenzaMm,
      larghezzaMm: o.larghezzaMm,
      note: o.note,
    }));
    const res = await prisma.optional.createMany({ data: chunk });
    optionaliCreati += res.count;
  }

  return NextResponse.json({ ok: true, prodottiCreati, optionaliCreati });
}
