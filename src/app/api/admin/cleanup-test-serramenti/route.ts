import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const BRAND = "P&C";

// Primo listino "serramenti" caricato come prova (finestre/portefinestre generiche
// Illumia PVC, gruppo INDOOR · SERRAMENTI) — da rimuovere prima di caricare il vero
// catalogo Zenith PVC.
const TIPOLOGIE_TEST = [
  "BLC1",
  "F1A1",
  "F2A1",
  "F3A1",
  "FF1",
  "PF1A1",
  "PF1A2",
  "PF2A1",
  "PF2A2",
  "PF3A1",
  "PF3A2",
  "STF1",
  "STFA1",
];

// Cliente/preventivi di prova creati dal seed iniziale (prisma/seed.ts): unico cliente
// per cui questa route ha il permesso di rimuovere righe preventivo per sbloccare la
// cancellazione dei prodotti — mai su un preventivo di un cliente reale.
const CLIENTE_DEMO_ID = "demo-cliente-1";

async function ricalcolaTotali(preventivoId: string) {
  const righe = await prisma.rigaPreventivo.findMany({
    where: { preventivoId },
    include: { optionali: true },
  });
  const imponibileLordo = righe.reduce((sum, r) => {
    const subOptionali = r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
    return sum + r.quantita * r.prezzoUnitario + r.optionalPrezzo + subOptionali;
  }, 0);
  const preventivoAttuale = await prisma.preventivo.findUnique({ where: { id: preventivoId } });
  if (!preventivoAttuale) return;
  const sconto = preventivoAttuale.scontoPercentuale ?? 0;
  const totaleNetto = imponibileLordo * (1 - sconto / 100);
  await prisma.preventivo.update({
    where: { id: preventivoId },
    data: { totaleNetto, totaleIva: totaleNetto * (preventivoAttuale.aliquotaIva / 100) },
  });
}

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

  const prodotti = await prisma.prodotto.findMany({
    where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_TEST } },
    select: { id: true, tipologia: true },
  });
  const modelli = await prisma.modelloProdotto.findMany({
    where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_TEST } },
    select: { tipologia: true },
  });
  const righeCollegate = await prisma.rigaPreventivo.findMany({
    where: { prodottoId: { in: prodotti.map((p) => p.id) } },
    select: {
      id: true,
      preventivoId: true,
      prodotto: { select: { tipologia: true } },
      preventivo: { select: { clienteId: true, cliente: { select: { nome: true } } } },
    },
  });

  const perTipologia: Record<string, number> = {};
  for (const t of TIPOLOGIE_TEST) perTipologia[t] = prodotti.filter((p) => p.tipologia === t).length;

  return NextResponse.json({
    ok: true,
    dryRun: true,
    prodottiTotali: prodotti.length,
    modelliTotali: modelli.length,
    prodottiPerTipologia: perTipologia,
    righeInPreventiviEsistenti: righeCollegate.map((r) => ({
      rigaId: r.id,
      preventivoId: r.preventivoId,
      tipologia: r.prodotto.tipologia,
      clienteId: r.preventivo.clienteId,
      clienteNome: r.preventivo.cliente.nome,
      isDemo: r.preventivo.clienteId === CLIENTE_DEMO_ID,
    })),
  });
}

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brand = await prisma.brand.findUnique({ where: { nome: BRAND } });
  if (!brand) return NextResponse.json({ error: "brand P&C non trovato" }, { status: 400 });

  const prodotti = await prisma.prodotto.findMany({
    where: { brandId: brand.id, tipologia: { in: TIPOLOGIE_TEST } },
    select: { id: true, tipologia: true },
  });

  const righeCollegate = await prisma.rigaPreventivo.findMany({
    where: { prodottoId: { in: prodotti.map((p) => p.id) } },
    select: { id: true, prodottoId: true, preventivoId: true, preventivo: { select: { clienteId: true } } },
  });

  // Solo le righe che appartengono al cliente demo del seed iniziale vengono rimosse
  // automaticamente per sbloccare la cancellazione del prodotto orfano. Qualsiasi altra
  // riga (cliente reale) blocca la cancellazione, come prima: mai toccare preventivi veri.
  const righeDemoDaRimuovere = righeCollegate.filter((r) => r.preventivo.clienteId === CLIENTE_DEMO_ID);
  const righeRealiBloccanti = righeCollegate.filter((r) => r.preventivo.clienteId !== CLIENTE_DEMO_ID);

  let righeDemoRimosse = 0;
  const preventiviDaRicalcolare = new Set<string>();
  if (righeDemoDaRimuovere.length > 0) {
    const rigaIds = righeDemoDaRimuovere.map((r) => r.id);
    await prisma.rigaOptional.deleteMany({ where: { rigaId: { in: rigaIds } } });
    const eliminate = await prisma.rigaPreventivo.deleteMany({ where: { id: { in: rigaIds } } });
    righeDemoRimosse = eliminate.count;
    for (const r of righeDemoDaRimuovere) preventiviDaRicalcolare.add(r.preventivoId);
    for (const preventivoId of preventiviDaRicalcolare) await ricalcolaTotali(preventivoId);
  }

  const idProdottiBloccati = new Set(righeRealiBloccanti.map((r) => r.prodottoId));
  const idProdottiCancellabili = prodotti.filter((p) => !idProdottiBloccati.has(p.id)).map((p) => p.id);
  const tipologieBloccate = [...new Set(prodotti.filter((p) => idProdottiBloccati.has(p.id)).map((p) => p.tipologia))];

  const prodottiCancellati = await prisma.prodotto.deleteMany({ where: { id: { in: idProdottiCancellabili } } });

  // Il modello (ModelloProdotto: immagine/descrizione/gruppo) si cancella solo se non
  // e' rimasto nessun Prodotto per quella tipologia (cioe' non era bloccata da un preventivo reale).
  const tipologieDaCancellareModello = TIPOLOGIE_TEST.filter((t) => !tipologieBloccate.includes(t));
  const modelliCancellati = await prisma.modelloProdotto.deleteMany({
    where: { brandId: brand.id, tipologia: { in: tipologieDaCancellareModello } },
  });

  return NextResponse.json({
    ok: true,
    righePreventivoDemoRimosse: righeDemoRimosse,
    preventiviRicalcolati: [...preventiviDaRicalcolare],
    prodottiCancellati: prodottiCancellati.count,
    modelliCancellati: modelliCancellati.count,
    tipologieBloccateDaPreventiviReali: tipologieBloccate,
  });
}
