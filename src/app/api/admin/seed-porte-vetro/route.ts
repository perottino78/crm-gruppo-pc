import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { catalogoPorteVetro, GRUPPO_PORTE_VETRO } from "@/lib/listini/porte-vetro";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;
const kP = (p: { tipologia: string; colore: string }) => `${p.tipologia}|${p.colore}`;
const kO = (o: { categoria: string; nome: string; listino: string | null }) => `${o.listino ?? ""}|${o.categoria}|${o.nome}`;

/** Porte a vetro per vetrate (VETRATE › Porte a vetro): listino fornitore + 60%. GET = prova, POST = carica (rilanciabile). */
async function esegui(prova: boolean) {
  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return { error: "brand P&C non trovato" };
  const cat = catalogoPorteVetro();
  const st = { prodottiCreati: 0, prodottiAggiornati: 0, prodottiRimossi: 0, prodottiNonRimovibili: 0, modelli: cat.modelli.length, optCreati: 0, optAggiornati: 0, optRimossi: 0 };

  const esistenti = await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: "PORTAVETRO_" } } });
  const mappa = new Map(esistenti.map((p) => [kP(p), p]));
  for (const p of cat.prodotti) {
    const e = mappa.get(kP(p));
    if (!e) {
      st.prodottiCreati++;
      if (!prova) await prisma.prodotto.create({ data: { brandId: brand.id, ...p, coefficienteRicarico: 1 } });
    } else if (e.prezzoBase !== p.prezzoBase || e.coefficienteRicarico !== 1 || e.altezzaMm !== p.altezzaMm || e.larghezzaMm !== p.larghezzaMm) {
      st.prodottiAggiornati++;
      if (!prova) await prisma.prodotto.update({ where: { id: e.id }, data: { prezzoBase: p.prezzoBase, coefficienteRicarico: 1, altezzaMm: p.altezzaMm, larghezzaMm: p.larghezzaMm } });
    }
  }
  const chiavi = new Set(cat.prodotti.map(kP));
  for (const v of esistenti.filter((p) => !chiavi.has(kP(p)))) {
    if (prova) { st.prodottiRimossi++; continue; }
    try { await prisma.prodotto.delete({ where: { id: v.id } }); st.prodottiRimossi++; } catch { st.prodottiNonRimovibili++; }
  }

  if (!prova)
    for (const m of cat.modelli) {
      const dati = { descrizioneTecnica: m.descrizioneTecnica, famiglia: "OUTDOOR", gruppo: GRUPPO_PORTE_VETRO, immagineUrl: m.immagineUrl, modalitaCalcolo: "GRIGLIA", parametriCalcolo: {} };
      await prisma.modelloProdotto.upsert({ where: { brandId_tipologia: { brandId: brand.id, tipologia: m.tipologia } }, create: { brandId: brand.id, tipologia: m.tipologia, ...dati }, update: dati });
    }

  const optEsistenti = await prisma.optional.findMany({ where: { brandId: brand.id, listino: { startsWith: "PORTAVETRO" } } });
  const mappaO = new Map(optEsistenti.map((o) => [kO(o), o]));
  for (const o of cat.optional) {
    const e = mappaO.get(kO(o));
    if (!e) {
      st.optCreati++;
      if (!prova) await prisma.optional.create({ data: { brandId: brand.id, ...o, gruppiApplicabili: [GRUPPO_PORTE_VETRO] } });
    } else if (e.valore !== o.valore || e.tipoPrezzo !== o.tipoPrezzo) {
      st.optAggiornati++;
      if (!prova) await prisma.optional.update({ where: { id: e.id }, data: { valore: o.valore, tipoPrezzo: o.tipoPrezzo } });
    }
  }
  const chiaviO = new Set(cat.optional.map(kO));
  for (const v of optEsistenti.filter((o) => !chiaviO.has(kO(o)))) {
    st.optRimossi++;
    if (prova) continue;
    // voci già usate in un'offerta: restano (le righe d'offerta non si toccano), tolte solo dalle tendine
    const usata = await prisma.rigaOptional.count({ where: { optionalId: v.id } });
    if (usata) await prisma.optional.update({ where: { id: v.id }, data: { listino: `OLD_${v.listino}` } });
    else await prisma.optional.delete({ where: { id: v.id } });
  }
  return { ok: true, prova, prodotti: cat.prodotti.length, optional: cat.optional.length, ...st };
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
