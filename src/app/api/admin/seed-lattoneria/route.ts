import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { catalogoLattoneria, GRUPPO_LATTONERIA, PREFISSO_LATTONERIA, FORNITORE_LATTONERIA, SCONTO_ACQUISTO_LATTONERIA } from "@/lib/listini/lattoneria";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;
type Riga = { tipologia: string; colore: string; larghezzaMm: number; altezzaMm: number; prezzoBase: number };
const norm = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(SRLS|SRL)$/, "");
const kP = (p: Riga) => `${p.tipologia}|${p.colore}|${p.larghezzaMm}|${p.altezzaMm}`;

/** Lattoneria in alluminio pressopiegato (OUTDOOR › LATTONERIA): prezzi a peso dal prezzario Il Mastro.
 *  GET = prova, POST = carica (rilanciabile: aggiorna i prezzi, toglie le voci non più a listino se nessuna offerta le usa). */
async function esegui(prova: boolean) {
  const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
  if (!brand) return { error: "brand P&C non trovato" };
  const cat = catalogoLattoneria();
  const st = { prodottiCreati: 0, prodottiAggiornati: 0, prodottiRimossi: 0, prodottiNonRimovibili: 0, modelliRimossi: 0 };
  // «_» nel LIKE vale «qualsiasi carattere»: si ricontrolla il prefisso esatto
  const esistenti = (await prisma.prodotto.findMany({ where: { brandId: brand.id, tipologia: { startsWith: PREFISSO_LATTONERIA } } }))
    .filter((p) => p.tipologia.startsWith(PREFISSO_LATTONERIA));
  const mappa = new Map(esistenti.map((p) => [kP(p), p]));
  const nuovi: Riga[] = [];
  for (const p of cat.prodotti) {
    const e = mappa.get(kP(p));
    if (!e) nuovi.push(p);
    else if (e.prezzoBase !== p.prezzoBase || e.coefficienteRicarico !== 1) {
      st.prodottiAggiornati++;
      if (!prova) await prisma.prodotto.update({ where: { id: e.id }, data: { prezzoBase: p.prezzoBase, coefficienteRicarico: 1 } });
    }
  }
  st.prodottiCreati = nuovi.length;
  if (!prova && nuovi.length) await prisma.prodotto.createMany({ data: nuovi.map((p) => ({ brandId: brand.id, ...p, coefficienteRicarico: 1 })) });
  const chiavi = new Set(cat.prodotti.map(kP));
  for (const v of esistenti.filter((p) => !chiavi.has(kP(p)))) {
    if (prova) { st.prodottiRimossi++; continue; }
    try { await prisma.prodotto.delete({ where: { id: v.id } }); st.prodottiRimossi++; } catch { st.prodottiNonRimovibili++; }
  }
  // Fornitore Il Mastro: cercato per nome (senza doppioni), creato se manca. Sul modello: fornitore, codice e sconto d'acquisto
  // (vendita × 50% = costo del fornitore → «costo previsto» negli ordini). Si riempiono solo se vuoti (mai sopra a scelte fatte a mano).
  const fornitori = await prisma.soggetto.findMany({ where: { ruoli: { has: "FORNITORE" } }, select: { id: true, ragioneSociale: true } });
  let fornitore = fornitori.find((f) => norm(f.ragioneSociale) === norm(FORNITORE_LATTONERIA)) ?? null;
  const fornitoreCreato = !fornitore;
  if (!fornitore && !prova) fornitore = await prisma.soggetto.create({ data: { ragioneSociale: FORNITORE_LATTONERIA, ruoli: ["FORNITORE"] }, select: { id: true, ragioneSociale: true } });
  if (!prova) {
    for (const m of cat.modelli) {
      const dati = { descrizioneTecnica: m.descrizioneTecnica, famiglia: "OUTDOOR", gruppo: GRUPPO_LATTONERIA, modalitaCalcolo: "GRIGLIA", parametriCalcolo: {} };
      const acquisto = { fornitoreId: fornitore!.id, codiceFornitore: m.tipologia.slice(PREFISSO_LATTONERIA.length), scontoAcquisto: SCONTO_ACQUISTO_LATTONERIA };
      const e = await prisma.modelloProdotto.findUnique({ where: { brandId_tipologia: { brandId: brand.id, tipologia: m.tipologia } } });
      if (!e) await prisma.modelloProdotto.create({ data: { brandId: brand.id, tipologia: m.tipologia, ...dati, ...acquisto } });
      else await prisma.modelloProdotto.update({
        where: { id: e.id },
        data: {
          ...dati,
          ...(e.fornitoreId ? {} : { fornitoreId: acquisto.fornitoreId }),
          ...(e.codiceFornitore ? {} : { codiceFornitore: acquisto.codiceFornitore }),
          ...(e.scontoAcquisto != null ? {} : { scontoAcquisto: acquisto.scontoAcquisto }),
        },
      });
    }
    // modelli di articoli tolti dal listino e senza più varianti
    const tipologie = new Set(cat.modelli.map((m) => m.tipologia));
    const vecchi = (await prisma.modelloProdotto.findMany({ where: { brandId: brand.id, gruppo: GRUPPO_LATTONERIA } })).filter((m) => !tipologie.has(m.tipologia));
    for (const m of vecchi) {
      if (await prisma.prodotto.count({ where: { brandId: brand.id, tipologia: m.tipologia } })) continue;
      await prisma.modelloProdotto.delete({ where: { id: m.id } });
      st.modelliRimossi++;
    }
  }
  return { ok: true, prova, prodotti: cat.prodotti.length, modelli: cat.modelli.length, fornitore: FORNITORE_LATTONERIA, fornitoreCreato, scontoAcquisto: SCONTO_ACQUISTO_LATTONERIA, ...st };
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
