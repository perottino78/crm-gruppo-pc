// «Chi» del movimento a mano in prima nota (richiesta di Rocco): cerca in anagrafica clienti e fornitori mentre si scrive
// (?q=) e, scelta la persona, le sue scadenze ancora da saldare (?scadenze=S:<soggetto>|C:<cliente>&tipo=PAGAMENTO|INCASSO).
// /api è fuori dal middleware: il controllo di accesso è fatto qui.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { utenteAmministrazione, residuoScadenza } from "@/lib/amministrazione/server";

export async function GET(req: NextRequest) {
  const u = await utenteAmministrazione();
  if (!u) return new Response("Non autorizzato", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const chi = sp.get("scadenze");
  if (chi) {
    const [tipo, id] = [chi.slice(0, 1), chi.slice(2)];
    const nome = tipo === "S"
      ? (await prisma.soggetto.findUnique({ where: { id }, select: { ragioneSociale: true } }))?.ragioneSociale
      : (await prisma.cliente.findUnique({ where: { id }, select: { nome: true } }))?.nome;
    if (!nome) return NextResponse.json({ scadenze: [] });
    const scadenze = await prisma.scadenza.findMany({
      where: {
        stato: { in: ["APERTA", "PARZIALE"] }, tipo: sp.get("tipo") === "INCASSO" ? "INCASSO" : "PAGAMENTO",
        // per collegamento o, per le scadenze scritte a mano, per nome
        OR: [tipo === "S" ? { soggettoId: id } : { clienteId: id }, { controparte: { equals: nome, mode: "insensitive" } }],
      },
      include: { abbinamenti: true },
      orderBy: [{ dataScadenza: { sort: "asc", nulls: "last" } }],
      take: 100,
    });
    return NextResponse.json({
      scadenze: scadenze.map((s) => ({ id: s.id, descrizione: s.descrizione, numero: s.numeroDocumento, data: s.dataScadenza, residuo: residuoScadenza(s), importo: s.importo }))
        .filter((s) => s.residuo > 0.004),
    });
  }
  const q = (sp.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ risultati: [] });
  const [soggetti, clienti] = await Promise.all([
    prisma.soggetto.findMany({ where: { ragioneSociale: { contains: q, mode: "insensitive" } }, select: { id: true, ragioneSociale: true, ruoli: true, partitaIva: true }, orderBy: { ragioneSociale: "asc" }, take: 8 }),
    prisma.cliente.findMany({ where: { nome: { contains: q, mode: "insensitive" } }, select: { id: true, nome: true, comune: true }, orderBy: { nome: "asc" }, take: 8 }),
  ]);
  return NextResponse.json({
    risultati: [
      ...soggetti.map((s) => ({ chiave: `S:${s.id}`, nome: s.ragioneSociale, info: s.ruoli.includes("FORNITORE") ? "fornitore" : s.ruoli.join(", ").toLowerCase() || "anagrafica" })),
      ...clienti.map((c) => ({ chiave: `C:${c.id}`, nome: c.nome, info: `cliente${c.comune ? ` · ${c.comune}` : ""}` })),
    ],
  });
}
