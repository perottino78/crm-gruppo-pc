import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// One-off: attiva il login per gli utenti creati prima dell'introduzione dell'autenticazione
// (username = email, nessuna password: vanno attivati impostando una password da Impostazioni),
// e assegna un responsabileId "best effort" ai clienti pre-esistenti che ne sono privi, in modo
// che restino visibili al loro commerciale/telefonista/posatore dopo l'attivazione del filtro
// dati per ruolo. Inferenza: primo Preventivo.commercialeId, poi Appuntamento.utenteId, poi
// Lead.telefonistaId (via leadOrigine) collegato al cliente, nell'ordine.
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const utentiSenzaUsername = await prisma.utente.findMany({ where: { username: null } });
    let utentiAggiornati = 0;
    for (const u of utentiSenzaUsername) {
      try {
        await prisma.utente.update({ where: { id: u.id }, data: { username: u.email } });
        utentiAggiornati++;
      } catch {
        // email duplicata come username altrove: skip, va risolto manualmente da Impostazioni
      }
    }

    const clientiSenzaResponsabile = await prisma.cliente.findMany({
      where: { responsabileId: null },
      include: {
        preventivi: { orderBy: { createdAt: "asc" }, take: 1, select: { commercialeId: true } },
        appuntamenti: { orderBy: { dataOra: "asc" }, take: 1, select: { utenteId: true } },
        leadOrigine: { select: { telefonistaId: true } },
      },
    });

    let clientiAggiornati = 0;
    for (const c of clientiSenzaResponsabile) {
      const responsabileId =
        c.preventivi[0]?.commercialeId ?? c.appuntamenti[0]?.utenteId ?? c.leadOrigine?.telefonistaId ?? null;
      if (responsabileId) {
        await prisma.cliente.update({ where: { id: c.id }, data: { responsabileId } });
        clientiAggiornati++;
      }
    }

    return NextResponse.json({
      ok: true,
      utentiTotali: utentiSenzaUsername.length,
      utentiAggiornati,
      clientiSenzaResponsabileTrovati: clientiSenzaResponsabile.length,
      clientiAggiornati,
      clientiRimastiSenzaResponsabile: clientiSenzaResponsabile.length - clientiAggiornati,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
