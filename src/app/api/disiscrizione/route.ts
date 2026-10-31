import { NextRequest, NextResponse } from "next/server";
import { disiscrivi } from "@/lib/automazioni/motore";

export const dynamic = "force-dynamic";

// Link "Non voglio più ricevere email" in fondo alle email ai clienti (firmato: non si può disiscrivere un altro).
export async function GET(req: NextRequest) {
  const ok = await disiscrivi(req.nextUrl.searchParams.get("l") ?? "", req.nextUrl.searchParams.get("t") ?? "");
  const testo = ok
    ? "Fatto: non riceverai più le nostre email automatiche. Se hai bisogno di noi chiamaci allo 011 19887497."
    : "Il link non è valido o è scaduto. Per non ricevere più email rispondi a una nostra email o chiamaci allo 011 19887497.";
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gruppo P&amp;C</title></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f4;margin:0"><div style="max-width:520px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden">
<div style="background:#ea580c;color:#fff;padding:16px 20px;font-weight:bold;font-size:18px">Gruppo P&amp;C</div>
<p style="padding:20px;font-size:16px;line-height:1.5">${testo}</p></div></body></html>`;
  return new NextResponse(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } });
}
