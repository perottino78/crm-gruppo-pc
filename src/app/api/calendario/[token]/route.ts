import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventiPeriodo, voceIcs } from "@/lib/calendario/server";
import { calendarioIcs } from "@/lib/calendario/ics";
import { vedeTutti } from "@/lib/calendario/eventi";

export const dynamic = "force-dynamic";

// Calendario in formato .ics (link privato), da 60 giorni fa a un anno avanti:
// - senza parametri: gli impegni del titolare del link;
// - ?persona=<id>: gli impegni di un collega, ?team=1: tutto il team (solo per chi vede il calendario di tutti:
//   amministratori, telefoniste, ufficio). Così su Google Calendar ognuno dei colleghi è un calendario con il suo colore.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = token.replace(/\.ics$/, "");
  const u = t.length >= 20 ? await prisma.utente.findFirst({ where: { calendarioToken: t, stato: { not: "DISATTIVATO" } } }) : null;
  if (!u) return new Response("Calendario non trovato", { status: 404 });
  const q = new URL(req.url).searchParams;
  const personaId = q.get("persona");
  const team = q.get("team") === "1";
  if ((personaId && personaId !== u.id) || team) {
    if (!vedeTutti(u)) return new Response("Puoi vedere solo il tuo calendario", { status: 403 });
  }
  const persona = personaId && personaId !== u.id ? await prisma.utente.findUnique({ where: { id: personaId }, select: { id: true, nome: true } }) : null;
  if (personaId && personaId !== u.id && !persona) return new Response("Collega non trovato", { status: 404 });
  const ora = Date.now();
  const eventi = await eventiPeriodo({ da: new Date(ora - 60 * 86400_000), a: new Date(ora + 365 * 86400_000), utenteId: team ? null : persona?.id ?? u.id });
  const ics = calendarioIcs(
    eventi.filter((e) => !/^ANNULLAT/.test(e.stato) && e.tipo !== "ESTERNO").map((e) => {
      const v = { ...voceIcs(e), sequenza: 0 };
      // nel calendario di tutto il team si vede di chi è l'impegno
      return team && e.chi ? { ...v, titolo: `${v.titolo} · ${e.chi}` } : v;
    }),
    { nome: team ? "CRM P&C — tutto il team" : `CRM P&C — ${persona?.nome ?? u.nome}` },
  );
  return new Response(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="crm-pc.ics"`, "Cache-Control": "no-store" },
  });
}
