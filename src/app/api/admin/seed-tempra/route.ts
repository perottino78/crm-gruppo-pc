import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/tempra_prodotti.json";
import { MODELLI_TEMPRA, descrizioneTempra, optionalTempra } from "@/lib/listini/tempra";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;
type Riga = { tipologia: string; colore: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number };
const kP = (p: Riga) => `${p.tipologia}|${p.colore}|${p.larghezzaMm}|${p.altezzaMm}`;
const kO = (o: { categoria: string; nome: string; listino: string | null }) => `${o.listino ?? ""}|${o.categoria}|${o.nome}`;

/** Pergola Tempra (STABYLA) nel gruppo PERGOLE: griglie L × sporgenza a prezzo di vendita (listino + 60%) e optional.
 *  GET = prova, POST = carica (rilanciabile). */
async function esegui(prova: boolean) {
  const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
  if (!brand) return { error: "brand P&C non trovato" };
  const righe = (prodottiData as (Riga & { listino?: number })[]).map(({ tipologia, colore, larghezzaMm, altezzaMm, prezzoBase }) => ({ tipologia, colore, larghezzaMm, altezzaMm, prezzoBase }));
  const st = { prodottiCreati: 0, prodottiAggiornati: 0, prodottiRimossi: 0, prodottiNonRimovibili: 0, optCreati: 0, optAggiornati: 0, optRimossi: 0 };

  const esistenti = await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: "STABYLA_" } } });
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
    for (const tipologia of [...new Set(righe.map((r) => r.tipologia))]) {
      const foto = MODELLI_TEMPRA[tipologia.split("_")[1]]?.foto;
      const dati = { descrizioneTecnica: descrizioneTempra(tipologia) ?? "", famiglia: "OUTDOOR", gruppo: "PERGOLE", immagineUrl: foto ? `/immagini/tempra/${foto}` : null, modalitaCalcolo: "GRIGLIA", parametriCalcolo: {} };
      await prisma.modelloProdotto.upsert({ where: { brandId_tipologia: { brandId: brand.id, tipologia } }, create: { brandId: brand.id, tipologia, ...dati }, update: dati });
    }

  const opt = optionalTempra();
  const optEsistenti = await prisma.optional.findMany({ where: { brandId: brand.id, listino: "TEMPRA" } });
  const mappaO = new Map(optEsistenti.map((o) => [kO(o), o]));
  for (const o of opt) {
    const e = mappaO.get(kO(o));
    if (!e) {
      st.optCreati++;
      if (!prova) await prisma.optional.create({ data: { brandId: brand.id, ...o, gruppiApplicabili: ["PERGOLE"] } });
    } else if (e.valore !== o.valore || e.tipoPrezzo !== o.tipoPrezzo) {
      st.optAggiornati++;
      if (!prova) await prisma.optional.update({ where: { id: e.id }, data: { valore: o.valore, tipoPrezzo: o.tipoPrezzo } });
    }
  }
  const chiaviO = new Set(opt.map(kO));
  for (const v of optEsistenti.filter((o) => !chiaviO.has(kO(o)))) {
    st.optRimossi++;
    if (prova) continue;
    const usata = await prisma.rigaOptional.count({ where: { optionalId: v.id } });
    if (usata) await prisma.optional.update({ where: { id: v.id }, data: { listino: `OLD_${v.listino}` } });
    else await prisma.optional.delete({ where: { id: v.id } });
  }
  return { ok: true, prova, prodotti: righe.length, optional: opt.length, ...st };
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
