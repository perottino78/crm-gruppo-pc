import { NextRequest, NextResponse } from "next/server";
import { getConfig, registraLead } from "@/lib/leadIngest";

export const dynamic = "force-dynamic";

// Collegamento DIRETTO con Meta Lead Ads (moduli istantanei Facebook/Instagram).
// In Meta for Developers: Webhooks → Page → "leadgen", URL = questo indirizzo,
// token di verifica = valore "meta_verify_token" in Impostazioni → Lead.
// Per leggere i dati del modulo serve il token pagina "meta_page_token".
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const atteso = await getConfig("meta_verify_token");
  if (p.get("hub.mode") === "subscribe" && atteso && p.get("hub.verify_token") === atteso) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

type CampoMeta = { name: string; values: string[] };

export async function POST(req: NextRequest) {
  const token = await getConfig("meta_page_token");
  const ev = await req.json().catch(() => null);
  if (!ev || !token) return NextResponse.json({ ok: false }, { status: 200 });
  const brandDefault = (await getConfig("meta_brand")) ?? "P&C";
  for (const entry of ev.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      const id = ch.value?.leadgen_id;
      if (ch.field !== "leadgen" || !id) continue;
      try {
        const r = await fetch(`https://graph.facebook.com/v21.0/${id}?fields=field_data,campaign_name,form_id&access_token=${token}`);
        const j = await r.json();
        const m: Record<string, string> = {};
        (j.field_data as CampoMeta[] | undefined)?.forEach((f) => (m[f.name.toLowerCase()] = f.values?.[0] ?? ""));
        await registraLead({
          nome: m.full_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.nome || "",
          telefono: m.phone_number || m.telefono,
          email: m.email,
          brand: brandDefault,
          fonte: "facebook",
          note: j.campaign_name ? `Campagna: ${j.campaign_name}` : null,
        });
      } catch {}
    }
  }
  return NextResponse.json({ ok: true });
}
