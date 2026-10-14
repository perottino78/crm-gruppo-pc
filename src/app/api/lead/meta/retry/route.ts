import { NextRequest, NextResponse } from "next/server";
import { runSweep } from "@/lib/meta/service";
import { makeDeps } from "@/lib/meta/runtime";
import { constantTimeEqual } from "@/lib/meta/signature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Ritentativi (recupero lead e consegne ai CRM a valle). Da schedulare ogni pochi minuti
// (Vercel Cron o scheduler esterno). Protetto da Authorization: Bearer META_RETRY_SECRET (o CRON_SECRET).
async function run(req: NextRequest) {
  const deps = makeDeps();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!deps.cfg.retrySecret || !token || !constantTimeEqual(token, deps.cfg.retrySecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const r = await runSweep(deps, 25);
  return NextResponse.json({ ok: true, ...r }); // solo contatori
}
export const GET = run;
export const POST = run;
