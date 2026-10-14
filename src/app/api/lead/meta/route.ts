import { NextRequest, NextResponse, after } from "next/server";
import { handleNotification, handleVerification, processDelivery, runSweep } from "@/lib/meta/service";
import { makeDeps } from "@/lib/meta/runtime";
import { MAX_PAYLOAD_BYTES } from "@/lib/meta/parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Receiver Meta Lead Ads (object=page, field=leadgen).
// ATTENZIONE: questo endpoint NON è collegato alla dashboard Meta. Vedi docs/META_LEADS.md
// prima di registrarlo come callback (esiste già un callback principale per la stessa app).

// Verifica iniziale (hub.mode / hub.verify_token / hub.challenge). Il token non viene mai loggato.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const r = handleVerification(
    { mode: p.get("hub.mode"), token: p.get("hub.verify_token"), challenge: p.get("hub.challenge") },
    makeDeps().cfg,
  );
  return new NextResponse(r.body, { status: r.status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

// Legge il corpo grezzo con un limite rigido di dimensione (anche senza Content-Length affidabile).
async function readLimited(req: NextRequest, max: number): Promise<Buffer | null> {
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function POST(req: NextRequest) {
  const deps = makeDeps();
  const declared = Number(req.headers.get("content-length") ?? 0);
  const raw = declared > MAX_PAYLOAD_BYTES ? null : await readLimited(req, MAX_PAYLOAD_BYTES);
  if (!raw) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });

  const r = await handleNotification({ raw, signature: req.headers.get("x-hub-signature-256"), declaredLength: declared }, deps);
  if (r.status === 200) {
    // Risposta rapida a Meta; recupero del lead e fan-out dopo la risposta. Il resto lo copre il retry.
    after(async () => {
      for (const id of r.toProcess) await processDelivery(deps, id).catch(() => undefined);
      await runSweep(deps, 10).catch(() => undefined);
    });
  }
  return NextResponse.json(r.body, { status: r.status });
}
