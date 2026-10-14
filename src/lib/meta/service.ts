import type { MetaConfig } from "./config";
import { authorizeEvent, MAX_PAYLOAD_BYTES, parseNotification } from "./parse";
import { constantTimeEqual, signInternal, verifyInternal, verifyMetaSignature } from "./signature";
import { fetchLead } from "./graph";
import { mapLead } from "./mapping";
import type { DeliveryRow, DownstreamRow, GraphLead, LeadSink, LeadgenEvent, Logger, MetaStore } from "./types";

export type Deps = {
  cfg: MetaConfig;
  store: MetaStore;
  sink: LeadSink;
  fetchImpl: typeof fetch;
  now: () => Date;
  log: Logger;
};

export const MAX_ATTEMPTS = 8;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const RECEIVED_GRACE_MS = 60 * 1000;

/** Backoff esponenziale: 30s, 1m, 2m, 4m, ... massimo 6h. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 6 * 3600 * 1000);
}
function nextRetry(deps: Deps, attempt: number, retriable: boolean): { retriabile: boolean; at: Date | null } {
  const ok = retriable && attempt < MAX_ATTEMPTS;
  return { retriabile: ok, at: ok ? new Date(deps.now().getTime() + backoffMs(attempt)) : null };
}

// ---------------------------------------------------------------- GET: verifica Meta
export function handleVerification(
  q: { mode?: string | null; token?: string | null; challenge?: string | null },
  cfg: Pick<MetaConfig, "verifyToken">,
): { status: number; body: string } {
  if (!cfg.verifyToken) return { status: 503, body: "not_configured" };
  if (q.mode !== "subscribe" || !q.token || !constantTimeEqual(q.token, cfg.verifyToken)) return { status: 403, body: "forbidden" };
  if (!q.challenge || q.challenge.length > 500) return { status: 400, body: "bad_request" };
  return { status: 200, body: q.challenge };
}

// ---------------------------------------------------------------- POST: notifiche Meta
export async function handleNotification(
  input: { raw: Buffer; signature: string | null; declaredLength?: number | null },
  deps: Deps,
): Promise<{ status: number; body: Record<string, unknown>; toProcess: string[] }> {
  const { cfg, store, log, now } = deps;
  const fail = (status: number, error: string) => ({ status, body: { ok: false, error }, toProcess: [] as string[] });

  if (!cfg.appSecret || !cfg.pageId || cfg.allowedFormIds.length === 0) {
    log("webhook_not_configured");
    return fail(503, "not_configured");
  }
  if ((input.declaredLength ?? 0) > MAX_PAYLOAD_BYTES || input.raw.length > MAX_PAYLOAD_BYTES) {
    log("webhook_too_large");
    return fail(413, "payload_too_large");
  }
  // La firma si verifica sul corpo grezzo, PRIMA di qualunque parsing.
  if (!verifyMetaSignature(input.raw, input.signature, cfg.appSecret)) {
    log("webhook_bad_signature");
    return fail(401, "invalid_signature");
  }
  const parsed = parseNotification(input.raw);
  if (!parsed.ok) {
    log("webhook_bad_payload", { reason: parsed.reason });
    return fail(400, "invalid_payload");
  }

  let ignored = parsed.skippedFields;
  let duplicates = 0;
  let received = 0;
  const toProcess: string[] = [];
  const seen = new Set<string>();
  for (const ev of parsed.events) {
    if (seen.has(ev.leadgenId)) {
      duplicates++;
      continue;
    }
    seen.add(ev.leadgenId);
    const auth = authorizeEvent(ev, cfg);
    if (auth !== "ok") {
      ignored++;
      log("webhook_event_not_allowed", { reason: auth });
      continue;
    }
    try {
      const eventJson = JSON.stringify(ev); // solo ID: nessun dato personale
      const r = await store.upsertReceived(ev, eventJson, now());
      if (r.isNew) received++;
      else duplicates++;
      if (r.stato !== "PROCESSED") toProcess.push(r.id);
    } catch {
      // Nulla è stato garantito su questo evento: 500 => Meta ritenta.
      log("webhook_persist_error");
      return { status: 500, body: { ok: false, error: "persist_failed" }, toProcess: [] };
    }
  }
  log("webhook_accepted", { received, duplicates, ignored });
  return { status: 200, body: { ok: true, received, duplicates, ignored }, toProcess };
}

// ---------------------------------------------------------------- elaborazione di un evento
function brandFor(cfg: MetaConfig, formId: string) {
  return cfg.formBrands[formId] ?? cfg.defaultBrand;
}

export async function processDelivery(deps: Deps, id: string): Promise<"processed" | "failed" | "skipped"> {
  const { cfg, store, sink, log } = deps;
  const staleBefore = new Date(deps.now().getTime() - STALE_PROCESSING_MS);
  const d = await store.claim(id, staleBefore);
  if (!d) return "skipped";

  const failWith = async (code: string, retriable: boolean) => {
    const r = nextRetry(deps, d.tentativi, retriable);
    await store.markFailed(d.id, code, r.retriabile, r.at);
    log("delivery_failed", { code, tentativi: d.tentativi, retriabile: r.retriabile });
    return "failed" as const;
  };

  try {
    let lead: GraphLead | null = d.leadJson ? (JSON.parse(d.leadJson) as GraphLead) : null;
    if (!lead) {
      const ev: LeadgenEvent = { leadgenId: d.leadgenId, pageId: d.pageId, formId: d.formId };
      const res = await fetchLead(ev, cfg, deps.fetchImpl);
      if (!res.ok) return await failWith(res.code, res.retriable);
      lead = res.lead;
      await store.saveLead(d.id, JSON.stringify(lead));
    }

    let leadId: string | null = d.leadId;
    if (cfg.localIngest) {
      const m = mapLead(lead);
      const r = await sink.ingest({
        externalId: d.leadgenId,
        nome: m.nome || "Contatto Meta",
        telefono: m.telefono,
        email: m.email,
        brand: brandFor(cfg, d.formId),
        note: ["Meta Lead Ads", lead.campaign_name ? `Campagna: ${lead.campaign_name}` : "", m.extra].filter(Boolean).join(" · "),
        formId: d.formId,
        adId: lead.ad_id ?? d.adId,
      });
      if (!r.ok) return await failWith(r.code, r.retriable);
      leadId = r.leadId;
    }
    await store.markProcessed(d.id, leadId);
    log("delivery_processed", { duplicate: false });

    // Fan-out: ogni destinatario ha stato e retry indipendenti.
    if (cfg.downstreams.length > 0) {
      await store.ensureDownstreams(d.id, cfg.downstreams.map((x) => x.name));
      const processed: DeliveryRow = { ...d, stato: "PROCESSED", leadJson: JSON.stringify(lead), leadId };
      for (const row of await store.getDownstreams(d.id)) {
        if (row.stato !== "DELIVERED") await deliverDownstream(deps, row, processed).catch(() => log("downstream_internal_error"));
      }
    }
    return "processed";
  } catch {
    return await failWith("internal_error", true);
  }
}

// ---------------------------------------------------------------- fan-out verso i CRM a valle
export function buildDownstreamPayload(d: DeliveryRow, nowIso: string): string {
  const ev = JSON.parse(d.eventJson) as LeadgenEvent;
  return JSON.stringify({
    event_id: d.leadgenId,
    leadgen_id: d.leadgenId,
    page_id: ev.pageId,
    form_id: ev.formId,
    ad_id: ev.adId ?? null,
    adgroup_id: ev.adgroupId ?? null,
    created_time: ev.createdTime ?? null,
    forwarded_at: nowIso,
    lead: d.leadJson ? JSON.parse(d.leadJson) : null, // l'App Secret non viene mai inoltrato
  });
}

export async function deliverDownstream(deps: Deps, row: DownstreamRow, d: DeliveryRow): Promise<boolean> {
  const target = deps.cfg.downstreams.find((x) => x.name === row.destinatario);
  if (!target) {
    await deps.store.markDownstreamFailed(row.id, "target_not_configured", false, null);
    return false;
  }
  const attempt = await deps.store.bumpDownstreamAttempt(row.id);
  const body = buildDownstreamPayload(d, deps.now().toISOString());
  const ts = String(Math.floor(deps.now().getTime() / 1000));
  let retriable = true;
  let code = "downstream_network";
  try {
    const res = await deps.fetchImpl(target.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gpc-event-id": d.leadgenId,
        "x-gpc-timestamp": ts,
        "x-gpc-signature": signInternal(target.secret, ts, body), // segreto diverso per ciascun CRM
        "x-gpc-attempt": String(attempt),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok || res.status === 409) {
      await deps.store.markDownstreamDelivered(row.id);
      deps.log("downstream_delivered", { target: target.name, attempt });
      return true;
    }
    code = `downstream_${res.status}`;
    retriable = res.status >= 500 || res.status === 429 || res.status === 408;
  } catch {
    /* rete/timeout: ritentabile */
  }
  const r = nextRetry(deps, attempt, retriable);
  await deps.store.markDownstreamFailed(row.id, code, r.retriabile, r.at);
  deps.log("downstream_failed", { target: target.name, code, retriabile: r.retriabile });
  return false;
}

// ---------------------------------------------------------------- ritentativi
export async function runSweep(deps: Deps, limit = 25): Promise<{ deliveries: number; downstreams: number }> {
  const now = deps.now();
  const ids = await deps.store.listRetryableDeliveries(new Date(now.getTime() - RECEIVED_GRACE_MS), new Date(now.getTime() - STALE_PROCESSING_MS), limit);
  let deliveries = 0;
  for (const id of ids) {
    const r = await processDelivery(deps, id).catch(() => "failed" as const);
    if (r !== "skipped") deliveries++;
  }
  let downstreams = 0;
  for (const { row, delivery } of await deps.store.listDueDownstreams(deps.now(), limit)) {
    await deliverDownstream(deps, row, delivery).catch(() => undefined);
    downstreams++;
  }
  return { deliveries, downstreams };
}

// ---------------------------------------------------------------- ricezione eventi interni (gateway → questo CRM)
export async function handleInternalEvent(
  input: { raw: Buffer; timestamp: string | null; signature: string | null },
  deps: Deps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { cfg, sink, log } = deps;
  if (!cfg.internalSecret || !cfg.pageId || cfg.allowedFormIds.length === 0) return { status: 503, body: { ok: false, error: "not_configured" } };
  if (input.raw.length > MAX_PAYLOAD_BYTES) return { status: 413, body: { ok: false, error: "payload_too_large" } };
  const text = input.raw.toString("utf8");
  if (!verifyInternal(cfg.internalSecret, input.timestamp, input.signature, text, Math.floor(deps.now().getTime() / 1000))) {
    log("internal_bad_signature");
    return { status: 401, body: { ok: false, error: "invalid_signature" } };
  }
  let p: { leadgen_id?: unknown; page_id?: unknown; form_id?: unknown; ad_id?: unknown; lead?: GraphLead | null };
  try {
    p = JSON.parse(text);
  } catch {
    return { status: 400, body: { ok: false, error: "invalid_payload" } };
  }
  const ev: LeadgenEvent = { leadgenId: String(p.leadgen_id ?? ""), pageId: String(p.page_id ?? ""), formId: String(p.form_id ?? "") };
  if (!/^\d+$/.test(ev.leadgenId) || authorizeEvent(ev, cfg) !== "ok") {
    log("internal_event_not_allowed");
    return { status: 200, body: { ok: true, ignored: true } };
  }
  if (!p.lead || !Array.isArray(p.lead.field_data) || p.lead.id !== ev.leadgenId) return { status: 400, body: { ok: false, error: "invalid_payload" } };
  const m = mapLead(p.lead);
  const r = await sink.ingest({
    externalId: ev.leadgenId,
    nome: m.nome || "Contatto Meta",
    telefono: m.telefono,
    email: m.email,
    brand: brandFor(cfg, ev.formId),
    note: ["Meta Lead Ads", p.lead.campaign_name ? `Campagna: ${p.lead.campaign_name}` : "", m.extra].filter(Boolean).join(" · "),
    formId: ev.formId,
    adId: typeof p.ad_id === "string" ? p.ad_id : (p.lead.ad_id ?? null),
  });
  if (!r.ok) return { status: r.retriable ? 503 : 422, body: { ok: false, error: r.code } };
  return { status: 200, body: { ok: true, duplicate: r.duplicate } };
}
