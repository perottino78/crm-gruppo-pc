import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { leggiCodice, linkSicuro } from "@/lib/mail/tracciamento";
import { APP_URL } from "@/lib/mail/invio";

export const dynamic = "force-dynamic";

// immagine trasparente 1×1 (GIF)
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Conta aperture (immagine invisibile) e clic (?u=link, poi si apre il link) di campagne ed email automatiche. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ codice: string }> }) {
  const { codice } = await params;
  const url = new URL(req.url).searchParams.get("u");
  const c = leggiCodice(codice);
  const ora = new Date();
  if (c) {
    try {
      const clic = !!url;
      // il primo clic vale anche come apertura (molti programmi di posta bloccano le immagini)
      const dati = clic ? { clic: { increment: 1 } } : { aperture: { increment: 1 } };
      if (c.tipo === "c") {
        await prisma.campagnaInvio.updateMany({ where: { id: c.id }, data: dati });
        await prisma.campagnaInvio.updateMany({ where: { id: c.id, apertaIl: null }, data: { apertaIl: ora } });
        if (clic) await prisma.campagnaInvio.updateMany({ where: { id: c.id, clicIl: null }, data: { clicIl: ora } });
      } else {
        await prisma.emailLead.updateMany({ where: { id: c.id }, data: dati });
        await prisma.emailLead.updateMany({ where: { id: c.id, apertaIl: null }, data: { apertaIl: ora } });
        if (clic) await prisma.emailLead.updateMany({ where: { id: c.id, clicIl: null }, data: { clicIl: ora } });
      }
    } catch { /* un conteggio perso non deve mai bloccare il cliente */ }
  }
  // si segue il link solo se il codice è firmato da noi (niente rimbalzi verso siti a caso)
  if (url) return Response.redirect(c && linkSicuro(url) ? url : APP_URL, 302);
  return new Response(PIXEL, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, private" } });
}
