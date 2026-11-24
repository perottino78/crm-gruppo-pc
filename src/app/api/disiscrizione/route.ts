import { NextRequest, NextResponse } from "next/server";
import { disiscrivi } from "@/lib/automazioni/motore";
import { disiscriviCliente } from "@/lib/campagne/motore";
import { prisma } from "@/lib/prisma";
import { registraConsenso } from "@/lib/privacy/consensi";

export const dynamic = "force-dynamic";

// Link "Non voglio più ricevere email promozionali" in fondo alle email ai clienti (firmato: non si può disiscrivere un altro).
// Ferma solo le email commerciali (campagne, lettere di vendita, promozioni): quelle di servizio continuano.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  // l = lead (email automatiche), c = cliente (campagne)
  const cId = q.get("c"), lId = q.get("l");
  const prima = cId ? await prisma.cliente.findUnique({ where: { id: cId }, select: { disiscritto: true, email: true } }) : lId ? await prisma.lead.findUnique({ where: { id: lId }, select: { disiscritto: true, email: true } }) : null;
  const ok = cId ? await disiscriviCliente(cId, q.get("t") ?? "") : await disiscrivi(lId ?? "", q.get("t") ?? "");
  // resta la prova della revoca (una riga sola, anche se il link viene aperto più volte)
  if (ok && prima && !prima.disiscritto) await registraConsenso({ clienteId: cId, leadId: cId ? null : lId, email: prima.email, stato: "REVOCATO", fonte: "DISISCRIZIONE", ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null });
  const testo = ok
    ? "Fatto: non riceverai più le nostre email promozionali. Continuerai a ricevere solo le comunicazioni legate alle tue richieste (appuntamenti, offerte, contatti con il tuo consulente). Se hai bisogno di noi chiamaci allo 011 19887497."
    : "Il link non è valido o è scaduto. Per non ricevere più email promozionali rispondi a una nostra email o chiamaci allo 011 19887497.";
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gruppo P&amp;C</title></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f4;margin:0"><div style="max-width:520px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden">
<div style="background:#ea580c;color:#fff;padding:16px 20px;font-weight:bold;font-size:18px">Gruppo P&amp;C</div>
<p style="padding:20px;font-size:16px;line-height:1.5">${testo}</p></div></body></html>`;
  return new NextResponse(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } });
}
