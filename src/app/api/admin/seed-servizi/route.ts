import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FAMIGLIA_SERVIZI, GRUPPO_SERVIZI, PREFISSO_SERVIZI, SERVIZI_LISTINO, descrizioneServizio, eServizioDaSpostare, prodottiServizi } from "@/lib/provvigioni/servizi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;
type Riga = { tipologia: string; colore: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number };
const kP = (p: Riga) => `${p.tipologia}|${p.colore}|${p.larghezzaMm}|${p.altezzaMm}`;

/**
 * «Servizi e pratiche» (richiesta di Ugo, nov 2026): pratica ENEA, autoscala e facchinaggio diventano prodotti del listino
 * (famiglia SERVIZI, per ogni marchio) senza la spunta «va in provvigione»; gli stessi voci che c'erano come optional nei
 * listini escono dagli optional proposti nell'offerta (restano sulle offerte già fatte) e non vanno in provvigione; le voci
 * «Facchinaggio» del listino Work&Service si tolgono se non sono mai state usate. GET = prova, POST = carica (rilanciabile).
 */
async function esegui(prova: boolean) {
  const brands = await prisma.brand.findMany({ select: { id: true, nome: true } });
  const righe = prodottiServizi();
  const st = { marchi: brands.length, prodottiCreati: 0, prodottiAggiornati: 0, prodottiRimossi: 0, modelli: 0, optionalSpostati: [] as string[], facchinaggioWsTolti: 0, facchinaggioWsUsati: 0 };

  for (const brand of brands) {
    // startsWith diventa LIKE e «_» vale qualsiasi carattere: ricontrollo il prefisso in JS
    const esistenti = (await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: PREFISSO_SERVIZI } } })).filter((p) => p.tipologia.startsWith(PREFISSO_SERVIZI));
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
      try { await prisma.prodotto.delete({ where: { id: v.id } }); st.prodottiRimossi++; } catch { /* usato in un'offerta: resta */ }
    }
    for (const s of SERVIZI_LISTINO) {
      st.modelli++;
      if (prova) continue;
      const dati = { descrizioneTecnica: descrizioneServizio(s.tipologia) ?? "", famiglia: FAMIGLIA_SERVIZI, gruppo: GRUPPO_SERVIZI, inProvvigione: false };
      await prisma.modelloProdotto.upsert({ where: { brandId_tipologia: { brandId: brand.id, tipologia: s.tipologia } }, create: { brandId: brand.id, tipologia: s.tipologia, ...dati }, update: dati });
    }
  }

  // optional ENEA / autoscala / facchinaggio dei vecchi listini: fuori dagli optional e dalla provvigione
  const optional = (await prisma.optional.findMany({ select: { id: true, nome: true, categoria: true, listino: true, attivo: true, inProvvigione: true, brand: { select: { nome: true } } } }))
    .filter((o) => eServizioDaSpostare(o.nome));
  for (const o of optional) {
    if (!o.attivo && !o.inProvvigione) continue;
    st.optionalSpostati.push(`${o.brand.nome} · ${o.categoria} · ${o.nome}`);
    if (!prova) await prisma.optional.update({ where: { id: o.id }, data: { attivo: false, inProvvigione: false } });
  }

  // voci «Facchinaggio» del listino Work&Service (varianti di tipologie con altre voci): via se mai usate
  const ws = (await prisma.prodotto.findMany({ where: { tipologia: { startsWith: "WSPOSA_" }, colore: { contains: "acchinaggio", mode: "insensitive" } }, select: { id: true, _count: { select: { righe: true } } } }));
  for (const p of ws) {
    if (p._count.righe) { st.facchinaggioWsUsati++; continue; }
    st.facchinaggioWsTolti++;
    if (!prova) await prisma.prodotto.delete({ where: { id: p.id } }).catch(() => { st.facchinaggioWsTolti--; st.facchinaggioWsUsati++; });
  }
  return { ok: true, prova, servizi: righe.length, ...st };
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
