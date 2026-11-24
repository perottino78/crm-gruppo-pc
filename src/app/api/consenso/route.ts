import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { firmaConsenso, linkInformativa, registraConsenso } from "@/lib/privacy/consensi";
import { TESTO_CONSENSO_MARKETING, leggiInformativa } from "@/lib/privacy/informativa";

export const dynamic = "force-dynamic";

// Link «Sì, voglio ricevere le novità» nelle email. Il GET NON registra nulla (i programmi di sicurezza della posta aprono i link da soli):
// mostra la richiesta con un pulsante, e solo il clic sul pulsante (POST) registra il consenso, con data, testo, versione dell'informativa e IP.
const pagina = (corpo: string, status = 200) => new NextResponse(
  `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gruppo P&amp;C</title></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f4;margin:0"><div style="max-width:520px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden">
<div style="background:#ea580c;color:#fff;padding:16px 20px;font-weight:bold;font-size:18px">Gruppo P&amp;C</div>
<div style="padding:20px;font-size:16px;line-height:1.5">${corpo}</div></div></body></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8" } });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function cliente(c: string, t: string) {
  if (!c || t !== firmaConsenso(c)) return null;
  return prisma.cliente.findUnique({ where: { id: c }, select: { id: true, email: true, consensoMarketingIl: true, disiscritto: true } });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const cl = await cliente(q.get("c") ?? "", q.get("t") ?? "");
  if (!cl) return pagina("<p>Il link non è valido o è scaduto. Se vuoi ricevere le nostre novità scrivici a info@gruppopec.com.</p>", 400);
  if (cl.consensoMarketingIl && !cl.disiscritto) return pagina("<p>Il tuo consenso è già registrato: continuerai a ricevere le nostre novità. Puoi revocarlo in ogni momento dal link in fondo a ogni email.</p>");
  return pagina(`<p style="margin-top:0"><strong>Vuoi continuare a ricevere le nostre novità?</strong></p>
<p style="font-size:14px;color:#444">${esc(TESTO_CONSENSO_MARKETING)}</p>
<form method="post"><input type="hidden" name="c" value="${esc(q.get("c") ?? "")}"><input type="hidden" name="t" value="${esc(q.get("t") ?? "")}"><input type="hidden" name="k" value="${esc(q.get("k") ?? "")}">
<button style="background:#ea580c;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:16px;font-weight:bold;cursor:pointer">Sì, acconsento</button></form>
<p style="font-size:13px;color:#666;margin-top:18px">Leggi l'<a href="${linkInformativa()}">informativa privacy</a>. Se non vuoi riceverle non devi fare nulla: usa il link «disiscriviti» in fondo all'email.</p>`);
}

export async function POST(req: NextRequest) {
  const fd = await req.formData().catch(() => null);
  const c = String(fd?.get("c") ?? ""), t = String(fd?.get("t") ?? ""), k = String(fd?.get("k") ?? "");
  const cl = await cliente(c, t);
  if (!cl) return pagina("<p>Il link non è valido o è scaduto.</p>", 400);
  if (!(cl.consensoMarketingIl && !cl.disiscritto)) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || null;
    await registraConsenso({ clienteId: cl.id, email: cl.email, stato: "CONCESSO", fonte: "LINK_EMAIL", testo: TESTO_CONSENSO_MARKETING, ip, campagnaId: k || null, versioneInformativa: (await leggiInformativa()).versione });
  }
  return pagina("<p><strong>Grazie!</strong> Il tuo consenso è registrato: continuerai a ricevere le nostre novità. Puoi revocarlo in ogni momento dal link in fondo a ogni email.</p>");
}
