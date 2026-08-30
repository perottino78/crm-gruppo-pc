import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Righe "orfane": create prima che introducessimo lo scoping per gruppo/listino
// (Lucilla/Nuvola/Panarea sono stati i primi cataloghi caricati, in un'epoca in cui
// Optional.gruppiApplicabili non esisteva ancora). Quando lo scoping e' stato aggiunto
// in seguito, le seed-route di quei 3 cataloghi cercano le righe esistenti filtrando
// per listino = "FAMIGLIA" o listino LIKE "PREFISSO_%" — un filtro che NON intercetta
// le vecchie righe con listino=null, quindi quelle vecchie righe non sono mai state
// aggiornate ne' cancellate: sono rimaste nel DB con gruppiApplicabili=[] (il default
// dello schema), il che le rende visibili su OGNI prodotto di OGNI catalogo (il filtro
// lato UI tratta un array vuoto come "nessuna restrizione di gruppo").
// Ad oggi nessun file di seed-data ha piu' gruppiApplicabili vuoto: qualunque riga in DB
// con gruppiApplicabili=[] e' quindi garantito un orfano di questo tipo, sicuro da rimuovere.
export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const orfani = await prisma.optional.findMany({
    where: { gruppiApplicabili: { equals: [] } },
    select: { id: true, brandId: true, categoria: true, nome: true, listino: true, valore: true },
    orderBy: [{ categoria: "asc" }, { nome: "asc" }],
  });

  return NextResponse.json({
    ok: true,
    dryRun: true,
    totale: orfani.length,
    righe: orfani,
  });
}

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const orfani = await prisma.optional.findMany({
    where: { gruppiApplicabili: { equals: [] } },
    select: { id: true },
  });

  const ids = orfani.map((o) => o.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, cancellati: 0 });
  }

  // Le righe orfane potrebbero essere referenziate da OptionalRiga su preventivi storici:
  // in quel caso non si puo' cancellare l'Optional senza rompere il riferimento. Le righe
  // gia' usate in un preventivo vengono quindi lasciate intatte (non piu' selezionabili per
  // nuove righe una volta rifatto il deploy dei filtri, ma senza perdita di dati storici);
  // solo le righe MAI usate in nessun preventivo vengono davvero cancellate.
  const usati = await prisma.rigaOptional.findMany({
    where: { optionalId: { in: ids } },
    select: { optionalId: true },
    distinct: ["optionalId"],
  });
  const idUsati = new Set(usati.map((u) => u.optionalId));
  const idCancellabili = ids.filter((id) => !idUsati.has(id));

  const res = await prisma.optional.deleteMany({ where: { id: { in: idCancellabili } } });

  return NextResponse.json({
    ok: true,
    trovati: ids.length,
    giaUsatiInPreventivi: idUsati.size,
    cancellati: res.count,
  });
}
