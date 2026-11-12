import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { destinatarioAssistenza, gestisceSegnalazioni } from "@/lib/segnalazioni/server";

// Schermata o PDF di una segnalazione: la vede chi l'ha mandata e chi gestisce l'assistenza.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("Non autorizzato", { status: 401 });
  const { id } = await params;
  const a = await prisma.segnalazioneAllegato.findUnique({ where: { id }, include: { segnalazione: { select: { autoreId: true } } } });
  if (!a) return new NextResponse("Non trovato", { status: 404 });
  if (a.segnalazione.autoreId !== u.id && !gestisceSegnalazioni(u, (await destinatarioAssistenza())?.id)) return new NextResponse("Non autorizzato", { status: 403 });
  return new NextResponse(Buffer.from(a.contenuto), {
    headers: { "Content-Type": a.mime, "Content-Disposition": `inline; filename="${encodeURIComponent(a.nome)}"`, "Cache-Control": "private, max-age=3600" },
  });
}
