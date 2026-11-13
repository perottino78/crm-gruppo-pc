import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { configGoogle, statoOAuth, urlConsenso } from "@/lib/calendario/google";

export const dynamic = "force-dynamic";

// «Collega Google»: porta l'amministratore alla pagina di consenso di Google (account amministrazione). Il ritorno è /api/google/callback.
export async function GET(req: NextRequest) {
  const pagina = new URL("/impostazioni/google", req.nextUrl.origin);
  const u = await getCurrentUser();
  if (!u) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  if (!puo(u, "calendario.google")) { pagina.searchParams.set("errore", "Solo l'amministratore collega Google Calendar"); return NextResponse.redirect(pagina); }
  const cfg = await configGoogle();
  if (!cfg.clientId || !cfg.haSecret) { pagina.searchParams.set("errore", "Prima inserisci Client ID e Client secret (passo 1)"); return NextResponse.redirect(pagina); }
  return NextResponse.redirect(urlConsenso(cfg.clientId, statoOAuth(u.id)));
}
