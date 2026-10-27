import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoVedereEntita } from "@/lib/documenti/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new Response("Accesso richiesto", { status: 401 });
  const { id } = await params;
  const d = await prisma.documento.findUnique({ where: { id } });
  if (!d || !(await puoVedereEntita(u, d.entita, d.entitaId))) return new Response("Documento non trovato", { status: 404 });
  const scarica = new URL(req.url).searchParams.has("scarica");
  // in linea solo PDF e immagini; tutto il resto si scarica
  const inLinea = !scarica && /^(application\/pdf|image\/(jpeg|png|webp|gif))$/.test(d.mime);
  return new Response(new Uint8Array(d.contenuto), {
    headers: {
      "Content-Type": d.mime,
      "Content-Disposition": `${inLinea ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(d.nome)}`,
      "Content-Length": String(d.dimensione),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
