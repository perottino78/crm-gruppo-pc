// Foto di rilievi e pose: servite a parte (e non dentro la pagina della pratica, che con tante foto diventava troppo pesante
// da aprire). Solo per chi è collegato al CRM. Le foto sono salvate come data URI: qui diventano un'immagine normale.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ tipo: string; id: string }> }) {
  if (!(await getCurrentUser())) return new NextResponse("Non autorizzato", { status: 401 });
  const { tipo, id } = await params;
  const riga = tipo === "rilievo"
    ? await prisma.rilievoAllegato.findUnique({ where: { id }, select: { dataUri: true, nome: true } })
    : tipo === "posa"
      ? await prisma.posaFoto.findUnique({ where: { id }, select: { dataUri: true, nome: true } })
      : null;
  if (!riga) return new NextResponse("Foto non trovata", { status: 404 });
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(riga.dataUri);
  if (!m) return new NextResponse("Foto non leggibile", { status: 422 });
  const corpo = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
  return new NextResponse(new Uint8Array(corpo), {
    headers: {
      "content-type": m[1] || "image/jpeg",
      "content-disposition": `inline; filename="${(riga.nome || "foto.jpg").replace(/[^\w.\- ]+/g, "_")}"`,
      "cache-control": "private, max-age=86400, immutable",
    },
  });
}
