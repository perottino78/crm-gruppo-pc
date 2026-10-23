import type { MetaConfig, Mode } from "./config";
import { authorizeEvent, MAX_PAYLOAD_BYTES, parseNotification } from "./parse";
import { constantTimeEqual, signInternal, verifyInternal, verifyMetaSignature } from "./signature";
import { fetchFormLeads, fetchLead } from "./graph";
import { mapLead } from "./mapping";
import type { DeliveryRow, DownstreamRow, GraphLead, InboundStore, LeadSink, LeadgenEvent, Logger, MetaStore } from "./types";

export type Deps = {
  cfg: MetaConfig;
  store: MetaStore;
  sink?: LeadSink; // assente nel gateway (nessun lead locale)
  inbound?: InboundStore; // presente nel CRM destinatario
  fetchImpl: typeof fetch;
  now: () => Date;
  log: Logger;
  random?: () => number;
};

export const SCHEMA_VERSION = 1;
export const MAX_ATTEMPTS = 15; // ~38 ore di copertura con backoff 30s … 6h
/** Un PROCESSING più vecchio di così è considerato abbandonato (funzione terminata a metà) e viene ripreso. */
export const STALE_PROCESSING_MS = 3 * 60 * 1000;
const RECEIVED_GRACE_MS = 30 * 1000;
const MAX_RETRY_AFTER_MS = 6 * 3600 * 1000;

export const eventIdFor = (leadgenId: string) => `meta_leadgen_${leadgenId}`;

/** Backoff esponenziale 30 s · 2^(n-1), tetto 6 h, con jitter ±20% (rand=0.5 → nessuno scostamento). */
export function backoffMs(attempt: number, rand = 0.5): number {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 6 * 3600 * 1000);
  return Math.round(base * (0.8 + 0.4 * rand));
}
function nextRetry(deps: Deps, attempt: number, retriable: boolean, minDelayMs = 0): { retriabile: boolean; at: Date | null } {
  const ok = retriable && attempt < MAX_ATTEMPTS;
  const rand = deps.random ? deps.random() : Math.random();
  const delay = Math.max(backoffMs(attempt, rand), Math.min(minDelayMs, MAX_RETRY_AFTER_MS));
  return { retriabile: ok, at: ok ? new Date(deps.now().getTime() + delay) : null };
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
// Garanzia: quando restituisce 200, tutto ciò che serve per completare il lavoro è già su database.
// L'elaborazione NON è eseguita qui: la riprende lo scheduler (runSweep) leggendo lo stato persistito.
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
      const r = await store.upsertReceived(ev, JSON.stringify(ev), now(), "META"); // solo ID, nessun dato personale
      if (r.isNew) received++;
      else duplicates++;
      if (r.stato !== "PROCESSED") toProcess.push(r.id);
    } catch {
      // Nulla è garantito su questo evento: 500 => Meta ritenta.
      log("webhook_persist_error");
      return { status: 500, body: { ok: false, error: "persist_failed" }, toProcess: [] };
    }
  }
  log("webhook_accepted", { received, duplicates, ignored });
  return { status: 200, body: { ok: true, received, duplicates, ignored }, toProcess };
}

// ---------------------------------------------------------------- elaborazione di un evento
const brandFor = (cfg: MetaConfig, formId: string) => cfg.formBrands[formId] ?? cfg.defaultBrand;

export async function processDelivery(deps: Deps, id: string): Promise<"processed" | "failed" | "skipped"> {
  const { cfg, store, sink, log } = deps;
  const d = await store.claim(id, new Date(deps.now().getTime() - STALE_PROCESSING_MS));
  if (!d) return "skipped";

  const failWith = async (code: string, retriable: boolean) => {
    const r = nextRetry(deps, d.tentativi, retriable);
    await store.markFailed(d.id, code, r.retriabile, r.at);
    log("delivery_failed", { code, tentativi: d.tentativi, retriabile: r.retriabile });
    return "failed" as const;
  };

  try {
    // 1. Recupero del lead UNA sola volta (poi riusato da tutti i destinatari e dai retry).
    let lead: GraphLead | null = d.leadJson ? (JSON.parse(d.leadJson) as GraphLead) : null;
    if (!lead) {
      const ev: LeadgenEvent = { leadgenId: d.leadgenId, pageId: d.pageId, formId: d.formId };
      const res = await fetchLead(ev, cfg, deps.fetchImpl);
      if (!res.ok) return await failWith(res.code, res.retriable);
      lead = res.lead;
      await store.saveLead(d.id, JSON.stringify(lead));
    }

    // 2. Righe di consegna create PRIMA di chiudere l'elaborazione: un crash successivo non perde destinatari.
    if (cfg.downstreams.length > 0) await store.ensureDownstreams(d.id, cfg.downstreams.map((x) => x.name));

    // 3. Eventuale creazione lead locale (solo se questo servizio è anche un CRM).
    let leadId: string | null = d.leadId;
    if (cfg.localIngest && d.origine === "META") {
      if (!sink) return await failWith("sink_missing", false);
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
    log("delivery_processed");

    // 4. Fan-out: ogni destinatario ha stato, tentativi e retry indipendenti.
    const processed: DeliveryRow = { ...d, stato: "PROCESSED", leadJson: JSON.stringify(lead), leadId };
    for (const row of await store.getDownstreams(d.id)) {
      if (row.stato !== "DELIVERED") {
        await deliverDownstream(deps, row, processed).catch(() => log("downstream_internal_error"));
      }
    }
    return "processed";
  } catch {
    return await failWith("internal_error", true);
  }
}

// ---------------------------------------------------------------- contratto downstream (v1)
/**
 * Corpo JSON inviato a ogni CRM. Deterministico per evento+modalità (stesso corpo a ogni tentativo),
 * senza App Secret, token Meta né firma Meta originale.
 */
export function buildDownstreamPayload(d: DeliveryRow, mode: Mode): string {
  const ev = JSON.parse(d.eventJson) as LeadgenEvent;
  const lead = d.leadJson ? (JSON.parse(d.leadJson) as GraphLead) : null;
  return JSON.stringify({
    schema_version: SCHEMA_VERSION,
    event_id: eventIdFor(d.leadgenId),
    source: "meta_lead_ads",
    mode,
    leadgen_id: d.leadgenId,
    page_id: ev.pageId,
    form_id: ev.formId,
    ad_id: ev.adId ?? lead?.ad_id ?? null,
    adgroup_id: ev.adgroupId ?? null,
    created_time: ev.createdTime ?? null,
    received_at: d.receivedAt.toISOString(),
    lead: lead
      ? { id: lead.id, created_time: lead.created_time ?? null, form_id: lead.form_id, ad_id: lead.ad_id ?? null, campaign_name: lead.campaign_name ?? null, field_data: lead.field_data }
      : null,
  });
}

export async function deliverDownstream(deps: Deps, row: DownstreamRow, d: DeliveryRow): Promise<boolean> {
  const target = deps.cfg.downstreams.find((x) => x.name === row.destinatario);
  if (!target) {
    await deps.store.markDownstreamFailed(row.id, "target_not_configured", false, null);
    return false;
  }
  // Un replay (rilettura manuale di un lead reale già gestito altrove) è SEMPRE shadow: mai effetti live.
  // Anche la lettura periodica (POLL) è shadow, salvo META_POLL_LIVE=true esplicito.
  const mode: Mode = d.origine === "REPLAY" || (d.origine === "POLL" && !deps.cfg.pollLive) ? "shadow" : target.mode;
  // Lease atomica: due scheduler concorrenti non inviano mai lo stesso evento allo stesso destinatario.
  const attempt = await deps.store.claimDownstream(row.id, deps.now(), 2 * 60 * 1000);
  if (attempt === null) return false;
  const body = buildDownstreamPayload(d, mode);
  const ts = String(Math.floor(deps.now().getTime() / 1000)); // nuovo timestamp (e firma) a ogni tentativo
  let retriable = true;
  let code = "downstream_network";
  let minDelay = 0;
  try {
    const res = await deps.fetchImpl(target.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "gpc-meta-gateway/1",
        "x-gpc-schema-version": String(SCHEMA_VERSION),
        "x-gpc-event-id": eventIdFor(d.leadgenId),
        "x-gpc-timestamp": ts,
        "x-gpc-signature": signInternal(target.secret, ts, body), // HMAC con il segreto PROPRIO di questo CRM
        "x-gpc-mode": mode,
        "x-gpc-attempt": String(attempt),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok || res.status === 409) {
      await deps.store.markDownstreamDelivered(row.id);
      deps.log("downstream_delivered", { target: target.name, attempt, mode, status: res.status });
      return true;
    }
    code = `downstream_${res.status}`;
    retriable = res.status >= 500 || [408, 425, 429].includes(res.status);
    const ra = Number(res.headers.get("retry-after"));
    if (Number.isFinite(ra) && ra > 0) minDelay = ra * 1000;
  } catch {
    /* rete/timeout: ritentabile */
  }
  const r = nextRetry(deps, attempt, retriable, minDelay);
  await deps.store.markDownstreamFailed(row.id, code, r.retriabile, r.at);
  deps.log("downstream_failed", { target: target.name, code, retriabile: r.retriabile });
  return false;
}

// ---------------------------------------------------------------- scheduler: sweep dello stato persistito
export async function runSweep(
  deps: Deps,
  opts: { limit?: number; budgetMs?: number } = {},
): Promise<{ deliveries: number; downstreams: number; stoppedForBudget: boolean }> {
  const limit = opts.limit ?? 25;
  const started = Date.now();
  const over = () => Date.now() - started > (opts.budgetMs ?? 40_000);
  const now = deps.now();
  const ids = await deps.store.listRetryableDeliveries(new Date(now.getTime() - RECEIVED_GRACE_MS), new Date(now.getTime() - STALE_PROCESSING_MS), limit);
  let deliveries = 0;
  let downstreams = 0;
  let stopped = false;
  for (const id of ids) {
    if (over()) { stopped = true; break; }
    if ((await processDelivery(deps, id).catch(() => "failed" as const)) !== "skipped") deliveries++;
  }
  for (const { row, delivery } of await deps.store.listDueDownstreams(deps.now(), limit)) {
    if (over()) { stopped = true; break; }
    await deliverDownstream(deps, row, delivery).catch(() => undefined);
    downstreams++;
  }
  return { deliveries, downstreams, stoppedForBudget: stopped };
}

// ---------------------------------------------------------------- lettura periodica (sola lettura, nessuna modifica a Meta)
/**
 * Legge i lead dei moduli consentiti con GET /{form}/leads e li accoda come eventi origine "POLL".
 * Idempotente: un leadgen_id già noto (da webhook, replay o lettura precedente) non viene mai ri-accodato.
 */
export async function pollLeads(
  deps: Deps,
  opts: { maxPages?: number; pageSize?: number } = {},
): Promise<{ forms: number; fetched: number; added: number; duplicates: number; deferred: number; errors: number }> {
  const { cfg, store, log } = deps;
  const out = { forms: 0, fetched: 0, added: 0, duplicates: 0, deferred: 0, errors: 0 };
  if (!cfg.pollEnabled || !cfg.pageId || cfg.allowedFormIds.length === 0) return out;
  const nowMs = deps.now().getTime();
  const since = cfg.pollSince ?? new Date(nowMs - cfg.pollLookbackHours * 3600_000);
  const sinceSec = Math.floor(since.getTime() / 1000);
  // Il webhook ha la precedenza: i lead troppo recenti si lasciano al webhook (verranno ripresi al giro
  // successivo solo se il webhook non arriva). Evita che un lead letto prima in POLL resti per sempre shadow.
  const youngerThan = nowMs - cfg.pollMinAgeMinutes * 60_000;
  for (const formId of cfg.allowedFormIds) {
    out.forms++;
    let after: string | null = null;
    for (let page = 0; page < (opts.maxPages ?? 10); page++) {
      const r = await fetchFormLeads(formId, cfg, deps.fetchImpl, { sinceSec, after, limit: opts.pageSize ?? 100 });
      if (!r.ok) { out.errors++; log("poll_failed", { reason: r.code }); break; }
      for (const lead of r.leads) {
        const ct = lead.created_time ? Date.parse(lead.created_time) : NaN;
        if (Number.isFinite(ct) && ct < since.getTime()) continue; // difesa in profondità sul filtro lato Meta
        if (Number.isFinite(ct) && ct > youngerThan) { out.deferred++; continue; } // troppo recente: decide il webhook
        out.fetched++;
        const ev: LeadgenEvent = { leadgenId: lead.id, pageId: cfg.pageId, formId, adId: lead.ad_id, createdTime: Number.isFinite(ct) ? Math.floor(ct / 1000) : undefined };
        if (authorizeEvent(ev, cfg) !== "ok") continue;
        try {
          const u = await store.upsertReceived(ev, JSON.stringify({ ...ev }), deps.now(), "POLL"); // eventJson: solo ID
          if (!u.isNew) { out.duplicates++; continue; }
          await store.saveLead(u.id, JSON.stringify(lead)); // lead già in mano: nessuna seconda chiamata a Graph
          out.added++;
        } catch { out.errors++; log("poll_persist_error"); }
      }
      if (!r.after) break;
      after = r.after;
    }
  }
  log("poll_done", out);
  return out;
}

// ---------------------------------------------------------------- replay manuale (solo shadow)
/**
 * Rilegge da Graph un lead reale già noto (es. dal log del CRM attuale) e lo distribuisce in SHADOW.
 * Serve a collaudare l'intera catena senza modificare Meta e senza creare duplicati live.
 */
export async function replayLead(deps: Deps, leadgenId: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const { cfg, store } = deps;
  if (!/^\d{1,30}$/.test(leadgenId)) return { status: 400, body: { ok: false, error: "invalid_leadgen_id" } };
  if (!cfg.pageId || cfg.allowedFormIds.length === 0) return { status: 503, body: { ok: false, error: "not_configured" } };
  const res = await fetchLead({ leadgenId, pageId: cfg.pageId, formId: "" }, cfg, deps.fetchImpl);
  if (!res.ok) return { status: res.retriable ? 502 : 422, body: { ok: false, error: res.code } };
  const ev: LeadgenEvent = { leadgenId, pageId: cfg.pageId, formId: res.lead.form_id, adId: res.lead.ad_id };
  if (authorizeEvent(ev, cfg) !== "ok") return { status: 403, body: { ok: false, error: "form_not_allowed" } };
  const r = await store.upsertReceived(ev, JSON.stringify(ev), deps.now(), "REPLAY");
  if (!r.isNew) return { status: 200, body: { ok: true, duplicate: true } }; // già gestito: nessun reinvio
  await store.saveLead(r.id, JSON.stringify(res.lead));
  const out = await processDelivery(deps, r.id);
  return { status: 200, body: { ok: true, duplicate: false, result: out } };
}

// ---------------------------------------------------------------- ricezione eventi interni (gateway → questo CRM)
export async function handleInternalEvent(
  input: { raw: Buffer; timestamp: string | null; signature: string | null; eventIdHeader?: string | null },
  deps: Deps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { cfg, sink, inbound, log } = deps;
  if (!cfg.internalSecret || !cfg.pageId || cfg.allowedFormIds.length === 0 || !inbound) return { status: 503, body: { ok: false, error: "not_configured" } };
  if (input.raw.length > MAX_PAYLOAD_BYTES) return { status: 413, body: { ok: false, error: "payload_too_large" } };
  const text = input.raw.toString("utf8");
  // Anti-replay: timestamp entro ±300 s dall'orologio locale + idempotenza per event_id.
  const nowSec = Math.floor(deps.now().getTime() / 1000);
  const sigOk = [cfg.internalSecret, cfg.internalSecretNext].some((s) => !!s && verifyInternal(s, input.timestamp, input.signature, text, nowSec));
  if (!sigOk) {
    log("internal_bad_signature");
    return { status: 401, body: { ok: false, error: "invalid_signature" } };
  }
  let p: { schema_version?: unknown; event_id?: unknown; mode?: unknown; leadgen_id?: unknown; page_id?: unknown; form_id?: unknown; ad_id?: unknown; lead?: GraphLead | null };
  try {
    p = JSON.parse(text);
  } catch {
    return { status: 400, body: { ok: false, error: "invalid_payload" } };
  }
  if (p.schema_version !== SCHEMA_VERSION) return { status: 422, body: { ok: false, error: "unsupported_schema_version" } };
  const ev: LeadgenEvent = { leadgenId: String(p.leadgen_id ?? ""), pageId: String(p.page_id ?? ""), formId: String(p.form_id ?? "") };
  if (!/^\d+$/.test(ev.leadgenId) || p.event_id !== eventIdFor(ev.leadgenId) || (input.eventIdHeader && input.eventIdHeader !== p.event_id)) {
    return { status: 400, body: { ok: false, error: "invalid_payload" } };
  }
  if (p.mode !== "shadow" && p.mode !== "live") return { status: 400, body: { ok: false, error: "invalid_payload" } };
  if (authorizeEvent(ev, cfg) !== "ok") {
    log("internal_event_not_allowed");
    return { status: 200, body: { ok: true, ignored: true } };
  }
  // Modalità effettiva: shadow se lo è il gateway O se questo CRM non è ancora stato abilitato a "live".
  const mode: Mode = p.mode === "live" && cfg.inboundMode === "live" ? "live" : "shadow";
  const rec = await inbound.record({ eventId: p.event_id as string, leadgenId: ev.leadgenId, pageId: ev.pageId, formId: ev.formId, mode }, deps.now());
  if (!rec.isNew && (rec.leadId || rec.mode === "shadow")) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }
  if (mode === "shadow") {
    log("internal_shadow_recorded");
    return { status: 202, body: { ok: true, shadow: true } }; // nessun lead, nessuna notifica, nessuna automazione
  }
  if (!sink) return { status: 503, body: { ok: false, error: "not_configured" } };
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
  await inbound.attachLead(p.event_id as string, r.leadId);
  return { status: 200, body: { ok: true, duplicate: r.duplicate } };
}
