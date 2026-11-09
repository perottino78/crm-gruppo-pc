import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LISTINO_TAGLIO_FREDDO, PREFISSO_TAGLIO_FREDDO, SEGNAPOSTO_TAGLIO_FREDDO, descrizioneTaglioFreddo, fotoTaglioFreddo, optionalTaglioFreddo, prodottiTaglioFreddo } from "@/lib/listini/taglio-freddo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;
type Riga = { tipologia: string; colore: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number };
const kP = (p: Riga) => `${p.tipologia}|${p.colore}|${p.larghezzaMm}|${p.altezzaMm}`;
const kO = (o: { categoria: string; nome: string; listino: string | null }) => `${o.listino ?? ""}|${o.categoria}|${o.nome}`;

/** Serramenti in alluminio a taglio freddo e verande (gruppo SERRAMENTI): tariffa al m² per sistema × vetro, supplementi,
 *  colori e sconti. Toglie il vecchio segnaposto «in arrivo». GET = prova, POST = carica (rilanciabile). */
async function esegui(prova: boolean) {
  const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
  if (!brand) return { error: "brand P&C non trovato" };
  const righe = prodottiTaglioFreddo();
  const st = { prodottiCreati: 0, prodottiAggiornati: 0, prodottiRimossi: 0, prodottiNonRimovibili: 0, optCreati: 0, optAggiornati: 0, optRimossi: 0, segnapostoTolto: 0 };

  // startsWith diventa LIKE e «_» vale qualsiasi carattere: ricontrollo il prefisso in JS
  const esistenti = (await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: PREFISSO_TAGLIO_FREDDO } } })).filter((p) => p.tipologia.startsWith(PREFISSO_TAGLIO_FREDDO));
  const mappa = new Map(esistenti.map((p) => [kP(p), p]));
  for (const p of righe) {
    const e = mappa.get(kP(p));
    if (!e) {
      st.prodottiCreati++;
      if (!prova) await prisma.prodotto.create({ data: { brandId: brand.id, ...p, coefficienteRicarico: 1 } });
    } else if (e.prezzoBase !== p.prezzoBase || e.coefficienteRicarico !== 1) {
      st.prodottiAggiornati++;
      if (!prova) await prisma.prodotto.update({ where: { id: e.id }, data: { prezzoBase: p.prezzoBase, coefficienteRicarico: 1 } });
    }
  }
  const chiavi = new Set(righe.map(kP));
  for (const v of esistenti.filter((p) => !chiavi.has(kP(p)))) {
    if (prova) { st.prodottiRimossi++; continue; }
    try { await prisma.prodotto.delete({ where: { id: v.id } }); st.prodottiRimossi++; } catch { st.prodottiNonRimovibili++; }
  }

  if (!prova) {
    for (const tipologia of [...new Set(righe.map((r) => r.tipologia))]) {
      const dati = { descrizioneTecnica: descrizioneTaglioFreddo(tipologia) ?? "", famiglia: "INDOOR", gruppo: "SERRAMENTI", immagineUrl: fotoTaglioFreddo(tipologia), modalitaCalcolo: "MQ_CON_MINIMI", parametriCalcolo: { arrotondamentoCm: 5 } };
      await prisma.modelloProdotto.upsert({ where: { brandId_tipologia: { brandId: brand.id, tipologia } }, create: { brandId: brand.id, tipologia, ...dati }, update: dati });
    }
    for (const p of await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: SEGNAPOSTO_TAGLIO_FREDDO } })) {
      try { await prisma.prodotto.delete({ where: { id: p.id } }); st.segnapostoTolto++; } catch { /* usato in un'offerta: resta */ }
    }
    await prisma.modelloProdotto.deleteMany({ where: { brandId: brand.id, tipologia: SEGNAPOSTO_TAGLIO_FREDDO } }).catch(() => null);
  }

  const opt = optionalTaglioFreddo();
  const optEsistenti = await prisma.optional.findMany({ where: { brandId: brand.id, listino: LISTINO_TAGLIO_FREDDO } });
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
