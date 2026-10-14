import { NextRequest, NextResponse } from "next/server";
import { handleInternalEvent } from "@/lib/meta/service";
import { makeDeps } from "@/lib/meta/runtime";
import { MAX_PAYLOAD_BYTES } from "@/lib/meta/parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Evento interno firmato (gateway → questo CRM). Non usa né l'App Secret né i token Meta:
// firma HMAC con META_INTERNAL_SECRET su `${timestamp}.${corpo}`. Idempotente per leadgen_id.
export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }
  const raw = Buffer.from(await req.arrayBuffer());
  const r = await handleInternalEvent(
    { raw, timestamp: req.headers.get("x-gpc-timestamp"), signature: req.headers.get("x-gpc-signature") },
    makeDeps(),
  );
  return NextResponse.json(r.body, { status: r.status });
}
