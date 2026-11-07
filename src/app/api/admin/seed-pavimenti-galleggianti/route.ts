import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import articoliData from "../../../../../prisma/seed-data/pavgal_articoli.json";
import { catalogoPavgal, type ArticoloPavgal } from "@/lib/listini/pavimenti-galleggianti";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;
type Riga = { tipologia: string; colore: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number };
const kO = (o: { categoria: string; nome: string; listino: string | null }) => `${o.listino ?? ""}|${o.categoria}|${o.nome}`;
const SEGNAPOSTO = "PAVGALLEGGIANTI_PLACEHOLDER";
const kP = (p: Riga) => `${p.tipologia}|${p.colore}|${p.larghezzaMm}|${p.altezzaMm}`;

/** Pavimenti galleggianti (PAVIMENTI › «Pavimenti galleggianti»): piastrelle La Faenza 2 cm al m² + pezzi speciali, piedini e servizi.
 *  GET = prova, POST = carica (rilanciabile). Toglie il segnaposto «in arrivo» se nessuna offerta lo usa. */
async function esegui(prova: boolean) {
  const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
  if (!brand) return { error: "brand P&C non trovato" };
  const cat = catalogoPavgal(articoliData as ArticoloPavgal[]);
  const righe: Riga[] = cat.prodotti.map(({ tipologia, colore, larghezzaMm, altezzaMm, prezzoBase }) => ({ tipologia, colore, larghezzaMm, altezzaMm, prezzoBase }));
  const st = { prodottiCreati: 0, prodottiAggiornati: 0, prodottiRimossi: 0, prodottiNonRimovibili: 0, optCreati: 0, optAggiornati: 0, optRimossi: 0, segnapostoTolto: 0 };
  // «_» nel LIKE vale «qualsiasi carattere»: si ricontrolla il prefisso esatto (altrimenti prenderebbe anche PAVGALLEGGIANTI_…)
  const esistenti = (await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: "PAVGAL_" } } })).filter((p) => p.tipologia.startsWith("PAVGAL_"));
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
  if (!prova) {
    for (const p of await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: SEGNAPOSTO } })) {
      try { await prisma.prodotto.delete({ where: { id: p.id } }); st.segnapostoTolto++; } catch { /* usato in un'offerta: resta */ }
    }
    await prisma.modelloProdotto.deleteMany({ where: { brandId: brand.id, tipologia: SEGNAPOSTO } }).catch(() => null);
  }

  // optional: listini PAVGAL* (gruppiApplicabili vuoto: non li tocca la rotta seed-wpc, che lavora sul gruppo PAVIMENTI)
  const optEsistenti = await prisma.optional.findMany({ where: { brandId: brand.id, listino: { startsWith: "PAVGAL" } } });
  const mappaO = new Map(optEsistenti.map((o) => [kO(o), o]));
  for (const o of cat.optional) {
    const e = mappaO.get(kO(o));
    if (!e) {
      st.optCreati++;
      if (!prova) await prisma.optional.create({ data: { brandId: brand.id, ...o, gruppiApplicabili: [] } });
    } else if (e.valore !== o.valore || e.unita !== o.unita) {
      st.optAggiornati++;
      if (!prova) await prisma.optional.update({ where: { id: e.id }, data: { valore: o.valore, unita: o.unita } });
    }
  }
  const chiaviO = new Set(cat.optional.map(kO));
  for (const v of optEsistenti.filter((o) => !chiaviO.has(kO(o)))) {
    st.optRimossi++;
    if (prova) continue;
    const usata = await prisma.rigaOptional.count({ where: { optionalId: v.id } });
    if (usata) await prisma.optional.update({ where: { id: v.id }, data: { listino: `OLD_${v.listino}` } });
    else await prisma.optional.delete({ where: { id: v.id } });
  }
  return { ok: true, prova, prodotti: righe.length, modelli: cat.modelli.length, optional: cat.optional.length, ...st };
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
