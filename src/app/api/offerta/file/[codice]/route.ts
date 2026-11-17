import { prisma } from "@/lib/prisma";
import { leggiCodiceFileRiga } from "@/lib/mail/link-offerta";

export const dynamic = "force-dynamic";

// File di una riga dell'offerta (foto/PDF) aperti dal cliente col link firmato: solo documenti di righe d'offerta, solo PDF e immagini.
export async function GET(_req: Request, { params }: { params: Promise<{ codice: string }> }) {
  const { codice } = await params;
  const id = leggiCodiceFileRiga(codice);
  if (!id) return new Response("Non trovato", { status: 404 });
  const d = await prisma.documento.findFirst({ where: { id, entita: "RIGA_PREVENTIVO" } });
  if (!d || !/^(application\/pdf|image\/(jpeg|png|webp|gif))$/.test(d.mime)) return new Response("Non trovato", { status: 404 });
  return new Response(new Uint8Array(d.contenuto), {
    headers: {
      "Content-Type": d.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(d.nome)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
