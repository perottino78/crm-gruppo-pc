// Ricerca dei complementi da aggiungere al rilievo: articoli dell'anagrafica e prodotti dei listini (con i colori).
// Solo per chi è collegato. Risponde con al massimo 25 risultati.
import { visibilitaArticoliWhere } from "@/lib/articoli/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { corrisponde } from "@/lib/ordini/costi-materiale";
import { labelBreveTipologia, unitaMisura } from "@/lib/prodotti";

export const dynamic = "force-dynamic";

export type RisultatoComplemento =
  | { tipo: "A"; id: string; label: string; fornitoreId: string | null; fornitore: string | null; um: string; costo: number | null }
  | { tipo: "P"; brandId: string; tipologia: string; label: string; gruppo: string | null; fornitoreId: string | null; colori: string[]; griglia: boolean; unita: "cm" | "mm" };

export async function GET(req: NextRequest) {
  const utente = await getCurrentUser();
  if (!utente) return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const tip = req.nextUrl.searchParams.get("tipologia"), brand = req.nextUrl.searchParams.get("brandId");
  if (tip && brand) {
    // un prodotto scelto dall'albero del listino: colori e se è a misura
    const m = await prisma.modelloProdotto.findFirst({ where: { brandId: brand, tipologia: tip }, select: { brandId: true, tipologia: true, gruppo: true, fornitoreId: true } });
    if (!m) return NextResponse.json({ risultati: [] });
    const righe = await prisma.prodotto.findMany({ where: { brandId: m.brandId, tipologia: m.tipologia }, distinct: ["colore"], select: { colore: true }, take: 80 });
    const griglia = (await prisma.prodotto.count({ where: { brandId: m.brandId, tipologia: m.tipologia, OR: [{ larghezzaMm: { gt: 0 } }, { altezzaMm: { gt: 0 } }] } })) > 0;
    return NextResponse.json({ risultati: [{ tipo: "P", brandId: m.brandId, tipologia: m.tipologia, label: labelBreveTipologia(m.tipologia) || m.tipologia, gruppo: m.gruppo, fornitoreId: m.fornitoreId, colori: righe.map((r) => r.colore), griglia, unita: unitaMisura(m.tipologia) }] });
  }
  if (q.length < 2) return NextResponse.json({ risultati: [] });
  const parole = q.split(/\s+/).filter(Boolean).slice(0, 5);
  const vis = visibilitaArticoliWhere(utente);

  const articoli = await prisma.articolo.findMany({
    where: { attivo: true, AND: [...(vis ? [vis] : []), ...parole.map((p) => ({ OR: [{ descrizione: { contains: p, mode: "insensitive" as const } }, { codice: { contains: p, mode: "insensitive" as const } }, { codiceFornitore: { contains: p, mode: "insensitive" as const } }] }))] },
    select: { id: true, codice: true, descrizione: true, um: true, costoAcquisto: true, fornitoreId: true, fornitore: { select: { ragioneSociale: true } } },
    orderBy: { codice: "asc" }, take: 12,
  });

  // prodotti dei listini: si cerca sul nome leggibile del modello (come nell'offerta), sul gruppo e sul codice tipologia
  const modelli = await prisma.modelloProdotto.findMany({ select: { brandId: true, tipologia: true, gruppo: true, famiglia: true, fornitoreId: true } });
  const trovati = modelli
    .map((m) => ({ ...m, label: labelBreveTipologia(m.tipologia) || m.tipologia }))
    .filter((m) => !/PLACEHOLDER/.test(m.tipologia) && corrisponde(`${m.label} ${m.gruppo ?? ""} ${m.famiglia ?? ""} ${m.tipologia.replace(/_/g, " ")}`, q))
    .slice(0, 13);
  const prodotti = await Promise.all(trovati.map(async (m) => {
    const righe = await prisma.prodotto.findMany({ where: { brandId: m.brandId, tipologia: m.tipologia }, distinct: ["colore"], select: { colore: true, larghezzaMm: true, altezzaMm: true }, take: 60 });
    const griglia = righe.length > 0 && (await prisma.prodotto.count({ where: { brandId: m.brandId, tipologia: m.tipologia, OR: [{ larghezzaMm: { gt: 0 } }, { altezzaMm: { gt: 0 } }] } })) > 0;
    return { tipo: "P" as const, brandId: m.brandId, tipologia: m.tipologia, label: m.label, gruppo: m.gruppo, fornitoreId: m.fornitoreId, colori: righe.map((r) => r.colore), griglia, unita: unitaMisura(m.tipologia) };
  }));

  const risultati: RisultatoComplemento[] = [
    ...articoli.map((a) => ({ tipo: "A" as const, id: a.id, label: `${a.codice} — ${a.descrizione}`, fornitoreId: a.fornitoreId, fornitore: a.fornitore?.ragioneSociale ?? null, um: a.um, costo: a.costoAcquisto })),
    ...prodotti.filter((p) => p.colori.length > 0),
  ];
  return NextResponse.json({ risultati });
}
