import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import prodottiData from "../../../../../prisma/seed-data/motori_prodotti.json";
import modelliData from "../../../../../prisma/seed-data/motori_modelli.json";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";

// Motori e Automatismi: a differenza degli altri cataloghi (tende a misura), qui ogni riga
// è un articolo a prezzo fisso (senza misura, altezzaMm/larghezzaMm = 0) raggruppato per
// tipologia (es. MOTORE_CHERUBINI_MECCANICO) con le varianti di modello nel campo "colore"
// e il codice articolo del produttore nel campo "descrizione", per tracciabilità.
//
// Sezione 9 2026: dati rifatti per intero (fedeltà completa) dal Catalogo Tende da Sole 2026,
// pagg. 146-156 — sostituiscono per intero i dati precedenti (provenienti da un Motori.pdf
// più datato/incompleto): aggiunto il brand SIMU (assente prima), aggiunte le categorie
// ADATTATORE_ e KIT_ (combinazioni pre-assemblate sensore+centralina+telecomando per N tende,
// a prezzo scalare per numero di tende gestite), e ricalcolati tutti i prezzi sulla formula
// 2026 (accessori: raw x2, nessuno sconto). Articoli del vecchio Motori.pdf non presenti in
// questo catalogo (es. Cherubini "Centralina gestione LED dimmer", "Sensore pioggia goccia
// filare", Nice "ERA PLUS M" senza soccorso, gateway Nice "CORE") sono stati rimossi in
// quanto non verificabili sul nuovo listino: la pulizia avviene per intero, cancellando tutte
// le righe esistenti nello scope (prefissi sotto) e ricreandole dal file dati corrente.
type ProdottoRow = { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number; prezzoBase: number; descrizione?: string };
type ModelloRow = { tipologia: string; descrizioneTecnica: string; famiglia: string; gruppo: string; immagineUrl?: string | null };

const TIPOLOGIE_PREFIXES = ["MOTORE_", "TELECOMANDO_", "CENTRALINA_", "SENSORE_", "GATEWAY_", "ADATTATORE_", "KIT_"];

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    // Pulizia completa dello scope "Motori e automatismi": il nuovo file dati è la fonte
    // di verità per l'intera sezione 9, quindi si cancella tutto ciò che rientra nei
    // prefissi gestiti e si ricrea da zero (più semplice e sicuro di un merge riga-per-riga
    // quando quasi tutti i codici/prezzi/brand cambiano rispetto alla versione precedente).
    const prodottiRimossi = await prisma.prodotto.deleteMany({
      where: { brandId: brand.id, OR: TIPOLOGIE_PREFIXES.map((p) => ({ tipologia: { startsWith: p } })) },
    });
    const modelliRimossi = await prisma.modelloProdotto.deleteMany({
      where: { brandId: brand.id, OR: TIPOLOGIE_PREFIXES.map((p) => ({ tipologia: { startsWith: p } })) },
    });

    const prodottiNuovi = prodottiData as ProdottoRow[];
    let prodottiCreati = 0;
    const CHUNK = 500;
    for (let i = 0; i < prodottiNuovi.length; i += CHUNK) {
      const chunk = prodottiNuovi.slice(i, i + CHUNK);
      const res = await prisma.prodotto.createMany({
        data: chunk.map((p) => ({
          brandId: brand.id,
          tipologia: p.tipologia,
          colore: p.colore,
          altezzaMm: p.altezzaMm,
          larghezzaMm: p.larghezzaMm,
          prezzoBase: p.prezzoBase,
          descrizione: p.descrizione ?? null,
          coefficienteRicarico: 1,
        })),
        skipDuplicates: true,
      });
      prodottiCreati += res.count;
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
        },
        update: {
          descrizioneTecnica: m.descrizioneTecnica,
          famiglia: m.famiglia,
          gruppo: m.gruppo,
          immagineUrl: m.immagineUrl ?? null,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      prodottiRimossi: prodottiRimossi.count,
      modelliRimossi: modelliRimossi.count,
      prodottiCreati,
      modelliAggiornati: modelli.length,
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
  return NextResponse.json({ prodottiCount, modelliCount });
}
