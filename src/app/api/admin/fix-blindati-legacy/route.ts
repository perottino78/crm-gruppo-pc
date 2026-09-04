import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";

// One-off fix: durante il primo seed di Blindati, alcune righe Prodotto sono state create
// in scala mm (es. 850x2100) invece che in scala cm (85x210), come richiesto dalla
// convenzione TIPOLOGIE_IN_CM. La reseed successiva (seed-blindati) ha creato le righe
// corrette in scala cm e ha rimosso le vecchie, TRANNE quelle già referenziate da una
// RigaPreventivo esistente (vincolo di chiave esterna). Questa route sistema quelle righe
// residue: se la riga corretta equivalente (stessa tipologia/colore, valori /10) esiste già
// come riga "pulita" senza preventivi collegati, la cancella e aggiorna la riga legacy con i
// valori corretti (così il preventivo esistente resta collegato allo stesso id, ma la riga
// Prodotto ora ha i valori giusti); altrimenti aggiorna direttamente la riga legacy.
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
    if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

    const righeBlindati = await prisma.prodotto.findMany({
      where: { brandId: brand.id, tipologia: { startsWith: "BLINDATI_" } },
    });

    // Scala mm-legacy: valori chiaramente fuori dal range cm previsto (max 250) e divisibili per 10.
    const legacy = righeBlindati.filter((r) => r.larghezzaMm > 250 || r.altezzaMm > 250);

    const risultati: Array<Record<string, unknown>> = [];

    for (const r of legacy) {
      const larghezzaCm = Math.round(r.larghezzaMm / 10);
      const altezzaCm = Math.round(r.altezzaMm / 10);

      const duplicatoPulito = righeBlindati.find(
        (p) =>
          p.id !== r.id &&
          p.tipologia === r.tipologia &&
          p.colore === r.colore &&
          p.larghezzaMm === larghezzaCm &&
          p.altezzaMm === altezzaCm
      );

      if (duplicatoPulito) {
        const riferimenti = await prisma.rigaPreventivo.count({ where: { prodottoId: duplicatoPulito.id } });
        if (riferimenti === 0) {
          await prisma.prodotto.delete({ where: { id: duplicatoPulito.id } });
        }
      }

      const aggiornato = await prisma.prodotto.update({
        where: { id: r.id },
        data: { larghezzaMm: larghezzaCm, altezzaMm: altezzaCm },
      });

      risultati.push({
        id: r.id,
        prima: { larghezzaMm: r.larghezzaMm, altezzaMm: r.altezzaMm },
        dopo: { larghezzaMm: aggiornato.larghezzaMm, altezzaMm: aggiornato.altezzaMm },
        duplicatoRimosso: duplicatoPulito ? duplicatoPulito.id : null,
      });
    }

    return NextResponse.json({ ok: true, righeSistemate: risultati.length, dettagli: risultati });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

  const righeBlindati = await prisma.prodotto.findMany({
    where: { brandId: brand.id, tipologia: { startsWith: "BLINDATI_" } },
  });
  const legacy = righeBlindati.filter((r) => r.larghezzaMm > 250 || r.altezzaMm > 250);

  return NextResponse.json({ ok: true, dryRun: true, totale: righeBlindati.length, legacyTrovate: legacy.length, legacy });
}
