// Foto del tetto con i pannelli messa nell'offerta dallo Studio. Pubblica come la vista dell'offerta che apre il cliente,
// ma solo per le foto di tipo OFFERTA (l'id è casuale e lungo); le altre foto del progetto restano riservate.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await prisma.solarisFoto.findFirst({ where: { id, tipo: "OFFERTA" }, select: { dataUri: true } });
  const m = f?.dataUri.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return new Response("Foto non trovata", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
