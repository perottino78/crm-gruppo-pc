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
  // data URI anche con parametri in più (es. «data:application/pdf;name=x.pdf;base64,…»)
  const virgola = riga.dataUri.indexOf(",");
  if (!riga.dataUri.startsWith("data:") || virgola < 0) return new NextResponse("File non leggibile", { status: 422 });
  const meta = riga.dataUri.slice(5, virgola), dati = riga.dataUri.slice(virgola + 1);
  const base64 = /;base64$/i.test(meta);
  const corpo = base64 ? Buffer.from(dati, "base64") : Buffer.from(decodeURIComponent(dati));
  let mime = meta.split(";")[0] || "image/jpeg";
  if (corpo.subarray(0, 4).toString("latin1") === "%PDF") mime = "application/pdf"; // PDF salvato con un tipo sbagliato
  return new NextResponse(new Uint8Array(corpo), {
    headers: {
      "content-type": mime,
      "content-disposition": `inline; filename="${(riga.nome || "foto.jpg").replace(/[^\w.\- ]+/g, "_")}"`,
      "cache-control": "private, max-age=86400, immutable",
    },
  });
}
