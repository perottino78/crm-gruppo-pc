import { NextRequest, NextResponse } from "next/server";
import { runSweep } from "@/lib/meta/service";
import { makeDeps } from "@/lib/meta/runtime";
import { authorizeScheduler } from "@/lib/meta/schedulerAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Ritentativi (recupero lead e consegne ai CRM a valle). Da schedulare ogni pochi minuti
// (Vercel Cron o scheduler esterno). Protetto da Authorization: Bearer META_RETRY_SECRET (o CRON_SECRET).
async function run(req: NextRequest) {
  const deps = makeDeps();
  const rawBody = req.method === "POST" ? await req.text() : "";
  const ok = authorizeScheduler(
    { authorization: req.headers.get("authorization"), upstashSignature: req.headers.get("upstash-signature"), url: req.url, rawBody, nowSec: Math.floor(Date.now() / 1000) },
    deps.cfg,
  );
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  const r = await runSweep(deps, { limit: 25 });
  return NextResponse.json({ ok: true, ...r }); // solo contatori
}
export const GET = run;
export const POST = run;
