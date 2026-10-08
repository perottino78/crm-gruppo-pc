import { NextRequest, NextResponse } from "next/server";
import { getLeadKey, registraLead } from "@/lib/leadIngest";

export const dynamic = "force-dynamic";

// Endpoint pubblico per inviare lead al CRM da sistemi esterni (gestionale pubblicità,
// Zapier, Make, Meta Lead Ads, form del sito). Protetto dalla chiave in Impostazioni → Lead.
//   POST /api/lead   header  x-api-key: <chiave>   (oppure ?key=<chiave>)
//   body JSON o form: nome, telefono, email, brand, fonte, note
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function pick(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

export async function POST(req: NextRequest) {
  const chiave = req.headers.get("x-api-key") ?? req.nextUrl.searchParams.get("key");
  if (!chiave || chiave !== (await getLeadKey())) {
    return NextResponse.json({ ok: false, errore: "chiave non valida" }, { status: 401, headers: CORS });
  }
  let body: Record<string, unknown> = {};
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("json")) body = await req.json();
    else {
      const fd = await req.formData();
      fd.forEach((v, k) => { if (typeof v === "string") body[k] = v; });
    }
  } catch {
    return NextResponse.json({ ok: false, errore: "dati non leggibili" }, { status: 400, headers: CORS });
  }
  const nome =
    pick(body, "nome", "name", "full_name", "fullName") ??
    [pick(body, "first_name", "firstName"), pick(body, "last_name", "lastName", "cognome")].filter(Boolean).join(" ");
  const r = await registraLead({
    nome: nome || "",
    telefono: pick(body, "telefono", "phone", "phone_number", "cellulare"),
    email: pick(body, "email", "e-mail", "mail"),
    brand: pick(body, "brand", "azienda"),
    fonte: pick(body, "fonte", "source", "utm_source") ?? "facebook",
    note: pick(body, "note", "messaggio", "message", "campagna", "campaign_name"),
  });
  if (!r) return NextResponse.json({ ok: false, errore: "servono nome e telefono o email" }, { status: 422, headers: CORS });
  return NextResponse.json({ ok: true, id: r.id, duplicato: r.duplicato }, { headers: CORS });
}
