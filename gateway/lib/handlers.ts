import { authorizeScheduler } from "../../src/lib/meta/schedulerAuth";
import { MAX_PAYLOAD_BYTES } from "../../src/lib/meta/parse";
import { handleNotification, handleVerification, replayLead, runSweep, type Deps } from "../../src/lib/meta/service";

export type Factory = () => Deps;
const j = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Lettura del corpo con limite rigido, indipendente da Content-Length.
async function readLimited(req: Request, max: number): Promise<Buffer | null> {
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// -------- Meta: GET verifica
export function webhookGET(make: Factory) {
  return async (req: Request) => {
    const p = new URL(req.url).searchParams;
    const r = handleVerification({ mode: p.get("hub.mode"), token: p.get("hub.verify_token"), challenge: p.get("hub.challenge") }, make().cfg);
    return new Response(r.body, { status: r.status, headers: { "content-type": "text/plain; charset=utf-8" } });
  };
}

// -------- Meta: POST. Persiste e risponde. NESSUNA elaborazione dopo la risposta: la riprende lo scheduler.
export function webhookPOST(make: Factory) {
  return async (req: Request) => {
    const declared = Number(req.headers.get("content-length") ?? 0);
    const raw = declared > MAX_PAYLOAD_BYTES ? null : await readLimited(req, MAX_PAYLOAD_BYTES);
    if (!raw) return j(413, { ok: false, error: "payload_too_large" });
    const r = await handleNotification({ raw, signature: req.headers.get("x-hub-signature-256"), declaredLength: declared }, make());
    return j(r.status, r.body);
  };
}

// -------- Scheduler: autenticazione forte (Bearer >= 32 car. oppure firma QStash)
async function authed(req: Request, deps: Deps): Promise<{ ok: boolean; body: string }> {
  const body = req.method === "POST" ? await req.text() : "";
  const ok = authorizeScheduler(
    { authorization: req.headers.get("authorization"), upstashSignature: req.headers.get("upstash-signature"), url: req.url, rawBody: body, nowSec: Math.floor(Date.now() / 1000) },
    deps.cfg,
  );
  return { ok, body };
}

export function tick(make: Factory) {
  return async (req: Request) => {
    const deps = make();
    if (!(await authed(req, deps)).ok) return j(401, { ok: false });
    const out = await runSweep(deps, { limit: 25, budgetMs: 40_000 });
    return j(200, { ok: true, ...out }); // solo contatori
  };
}

export function requeue(make: Factory) {
  return async (req: Request) => {
    const deps = make();
    const a = await authed(req, deps);
    if (!a.ok) return j(401, { ok: false });
    let dest: string | undefined;
    try { dest = (JSON.parse(a.body || "{}") as { destinatario?: string }).destinatario; } catch { return j(400, { ok: false }); }
    const now = deps.now();
    return j(200, { ok: true, deliveries: await deps.store.requeueDeliveries(now), downstreams: await deps.store.requeueDownstreams(now, dest) });
  };
}

export function replay(make: Factory) {
  return async (req: Request) => {
    const deps = make();
    const a = await authed(req, deps);
    if (!a.ok) return j(401, { ok: false });
    let id = "";
    try { id = String((JSON.parse(a.body || "{}") as { leadgen_id?: unknown }).leadgen_id ?? ""); } catch { return j(400, { ok: false }); }
    const r = await replayLead(deps, id);
    return j(r.status, r.body);
  };
}

export function status(make: Factory) {
  return async (req: Request) => {
    const deps = make();
    if (!(await authed(req, deps)).ok) return j(401, { ok: false });
    return j(200, { ok: true, ...(await deps.store.stats()), downstreams_configured: deps.cfg.downstreams.map((d) => ({ name: d.name, mode: d.mode })) });
  };
}

export const health = () => j(200, { ok: true });
