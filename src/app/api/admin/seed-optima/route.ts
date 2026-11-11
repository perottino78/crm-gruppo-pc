import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/optima_prodotti.json";
import { TIPOLOGIE_OPTIMA, PREFISSO_OPTIMA, optionalOptima, labelOptima } from "@/lib/listini/optima";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;
type Riga = { tipologia: string; colore: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number };
const kP = (p: { tipologia: string; colore: string; larghezzaMm: number; altezzaMm: number }) => `${p.tipologia}|${p.colore}|${p.larghezzaMm}|${p.altezzaMm}`;
const kO = (o: { categoria: string; nome: string; listino: string | null }) => `${o.listino ?? ""}|${o.categoria}|${o.nome}`;
const SEGNAPOSTO = "SERRAMENTI_PVC_OPTIMA_PLACEHOLDER";

/** Serramenti in PVC Optima 70 (gruppo SERRAMENTI, «PVC — Optima 70»): griglie di prezzo + optional. GET = prova, POST = carica (rilanciabile). */
async function esegui(prova: boolean) {
  const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
  if (!brand) return { error: "brand P&C non trovato" };
  const righe = prodottiData as Riga[];
  const st = { prodottiCreati: 0, prodottiAggiornati: 0, prodottiRimossi: 0, prodottiNonRimovibili: 0, optCreati: 0, optAggiornati: 0, optRimossi: 0, segnapostoTolto: 0 };

  // in Prisma «startsWith: "OPTIMA_"» diventa LIKE e «_» vale qualsiasi carattere: ricontrollo il prefisso
  const esistenti = (await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: PREFISSO_OPTIMA } } })).filter((p) => p.tipologia.startsWith(PREFISSO_OPTIMA));
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

  if (!prova) {
    for (const [tipologia, t] of Object.entries(TIPOLOGIE_OPTIMA)) {
      const dati = {
        descrizioneTecnica: `Serramento in PVC OPTIMA 70: 5 camere isolanti, profondità 70 mm, Uf 1,3 W/m²K, doppia guarnizione EPDM, rinforzo in acciaio zincato, isolamento acustico fino a 45 dB, colore garantito 10 anni. ${t.descrizione}. Prezzo di listino, bianco massa compreso (pellicole +20%).`,
        famiglia: "INDOOR", gruppo: "SERRAMENTI", immagineUrl: `/immagini/fidra/${t.foto}`, modalitaCalcolo: "GRIGLIA", parametriCalcolo: {},
      };
      await prisma.modelloProdotto.upsert({ where: { brandId_tipologia: { brandId: brand.id, tipologia } }, create: { brandId: brand.id, tipologia, ...dati }, update: dati });
    }
    // il segnaposto «in arrivo» non serve più: lo tolgo se nessuna offerta lo usa
    for (const p of await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: SEGNAPOSTO } })) {
      try { await prisma.prodotto.delete({ where: { id: p.id } }); st.segnapostoTolto++; } catch { /* usato in un'offerta: resta */ }
    }
    await prisma.modelloProdotto.deleteMany({ where: { brandId: brand.id, tipologia: SEGNAPOSTO } }).catch(() => null);
  }

  const opt = optionalOptima();
  const optEsistenti = await prisma.optional.findMany({ where: { brandId: brand.id, listino: { startsWith: "OPTIMA" } } });
  const mappaO = new Map(optEsistenti.map((o) => [kO(o), o]));
  for (const o of opt) {
    const e = mappaO.get(kO(o));
    if (!e) {
      st.optCreati++;
      if (!prova) await prisma.optional.create({ data: { brandId: brand.id, ...o, gruppiApplicabili: ["SERRAMENTI"] } });
    } else if (e.valore !== o.valore || e.tipoPrezzo !== o.tipoPrezzo || e.unita !== o.unita) {
      st.optAggiornati++;
      if (!prova) await prisma.optional.update({ where: { id: e.id }, data: { valore: o.valore, tipoPrezzo: o.tipoPrezzo, unita: o.unita } });
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
  return { ok: true, prova, tipologie: Object.keys(TIPOLOGIE_OPTIMA).map((t) => labelOptima(t)), prodotti: righe.length, optional: opt.length, ...st };
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
