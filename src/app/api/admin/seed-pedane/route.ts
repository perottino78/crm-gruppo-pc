import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { catalogoPedane } from "@/lib/listini/pedane";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;
type Riga = { tipologia: string; colore: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number };
const kP = (p: Riga) => `${p.tipologia}|${p.colore}|${p.larghezzaMm}|${p.altezzaMm}`;

/** Pedane autoportanti (PAVIMENTI › «Pedane autoportanti»): griglie A × B in cm = listino fornitore × 2. GET = prova, POST = carica (rilanciabile). */
async function esegui(prova: boolean) {
  const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
  if (!brand) return { error: "brand P&C non trovato" };
  const cat = catalogoPedane();
  const righe: Riga[] = cat.prodotti.map(({ tipologia, colore, larghezzaMm, altezzaMm, prezzoBase }) => ({ tipologia, colore, larghezzaMm, altezzaMm, prezzoBase }));
  const st = { prodottiCreati: 0, prodottiAggiornati: 0, prodottiRimossi: 0, prodottiNonRimovibili: 0 };
  const esistenti = await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: "PEDANA_" } } });
  const mappa = new Map(esistenti.map((p) => [kP(p), p]));
  const nuovi: Riga[] = [];
  for (const p of righe) {
    const e = mappa.get(kP(p));
    if (!e) nuovi.push(p);
    else if (e.prezzoBase !== p.prezzoBase || e.coefficienteRicarico !== 1) {
      st.prodottiAggiornati++;
      if (!prova) await prisma.prodotto.update({ where: { id: e.id }, data: { prezzoBase: p.prezzoBase, coefficienteRicarico: 1 } });
    }
  }
  st.prodottiCreati = nuovi.length;
  if (!prova && nuovi.length) await prisma.prodotto.createMany({ data: nuovi.map((p) => ({ brandId: brand.id, ...p, coefficienteRicarico: 1 })) });
  const chiavi = new Set(righe.map(kP));
  for (const v of esistenti.filter((p) => !chiavi.has(kP(p)))) {
    if (prova) { st.prodottiRimossi++; continue; }
    try { await prisma.prodotto.delete({ where: { id: v.id } }); st.prodottiRimossi++; } catch { st.prodottiNonRimovibili++; }
  }
  if (!prova)
    for (const m of cat.modelli) {
      const dati = { descrizioneTecnica: m.descrizioneTecnica, famiglia: "OUTDOOR", gruppo: "PAVIMENTI", immagineUrl: m.immagineUrl, modalitaCalcolo: "GRIGLIA", parametriCalcolo: {} };
      await prisma.modelloProdotto.upsert({ where: { brandId_tipologia: { brandId: brand.id, tipologia: m.tipologia } }, create: { brandId: brand.id, tipologia: m.tipologia, ...dati }, update: dati });
    }
  return { ok: true, prova, prodotti: righe.length, modelli: cat.modelli.length, ...st };
}

export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await esegui(true));
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await esegui(false));
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
