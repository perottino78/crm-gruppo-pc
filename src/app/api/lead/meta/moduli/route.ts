import { NextRequest, NextResponse } from "next/server";
import { loadMetaConfig } from "@/lib/meta/config";
import { firmaValida, pulisciCatalogo } from "@/lib/meta/moduli";
import { cfgConModuli, chiaviPagine, salvaCatalogo, salvaIndirizzoGateway } from "@/lib/meta/moduli-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Il gateway (firmato con META_INTERNAL_SECRET) chiede quali moduli istantanei sono collegati e, ogni 5 minuti,
// porta l'elenco dei moduli letti da Meta e il proprio indirizzo. Risponde solo con gli ID dei moduli collegati.
export async function POST(req: NextRequest) {
  const cfg = loadMetaConfig();
  const corpo = await req.text();
  if (corpo.length > 512_000) return NextResponse.json({ ok: false }, { status: 413 });
  if (!firmaValida([cfg.internalSecret, cfg.internalSecretNext], req.headers.get("x-gpc-timestamp"), req.headers.get("x-gpc-signature"), corpo)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let b: { catalogo?: unknown; gateway_url?: unknown } = {};
  try { b = JSON.parse(corpo || "{}"); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const c = b.catalogo ? pulisciCatalogo(b.catalogo) : null;
  if (c) await salvaCatalogo(c);
  await salvaIndirizzoGateway(b.gateway_url);
  const eff = await cfgConModuli(cfg);
  // anche le pagine che conosce ONE (e le loro chiavi): il gateway le accetta e le legge senza cambiare le sue variabili
  return NextResponse.json({ ok: true, moduli: eff.allowedFormIds, pagine: eff.pageIds, token: await chiaviPagine() });
}
