import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventiPeriodo, voceIcs } from "@/lib/calendario/server";
import { calendarioIcs } from "@/lib/calendario/ics";

export const dynamic = "force-dynamic";

// Calendario personale in formato .ics (link privato): da 60 giorni fa a un anno avanti
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = token.replace(/\.ics$/, "");
  const u = t.length >= 20 ? await prisma.utente.findUnique({ where: { calendarioToken: t } }) : null;
  if (!u) return new Response("Calendario non trovato", { status: 404 });
  const ora = Date.now();
  const eventi = await eventiPeriodo({ da: new Date(ora - 60 * 86400_000), a: new Date(ora + 365 * 86400_000), utenteId: u.id });
  const ics = calendarioIcs(
    eventi.filter((e) => !/^ANNULLAT/.test(e.stato)).map((e) => ({ ...voceIcs(e), sequenza: 0 })),
    { nome: `CRM P&C — ${u.nome}` },
  );
  return new Response(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="crm-pc.ics"`, "Cache-Control": "no-store" },
  });
}
