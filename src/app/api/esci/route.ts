import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Chiude la sessione di chi è stato messo in pausa o disattivato mentre era collegato
// (il cookie è ancora valido, ma l'utente non può più entrare) e spiega il motivo nella pagina di login.
export async function GET(req: NextRequest) {
  const sessione = await verifySession(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  const u = sessione ? await prisma.utente.findUnique({ where: { id: sessione.utenteId }, select: { stato: true } }) : null;
  const motivo = u?.stato === "PAUSA" ? "pausa" : u?.stato === "DISATTIVATO" ? "disattivato" : "sessione";
  const r = NextResponse.redirect(new URL(`/login?errore=${motivo}`, req.url));
  r.cookies.delete(SESSION_COOKIE_NAME);
  return r;
}
