import { loadMetaConfig, type MetaConfig } from "../../src/lib/meta/config";
import { metaSignature, signInternal } from "../../src/lib/meta/signature";
import type { Deps } from "../../src/lib/meta/service";
import type { DeliveryRow, DeliveryStato, DownstreamRow, InboundStore, IngestInput, IngestResult, LeadSink, LeadgenEvent, MetaStore, Origine } from "../../src/lib/meta/types";

// Tutti i valori sono FINTI e usati solo nei test. Mai segreti reali.
export const T = {
  appSecret: "test_app_secret_not_real",
  token: "TEST_ACCESS_TOKEN_not_real",
  verify: "test_verify_token_not_real",
  pageId: "1039357632750262",
  formId: "1280816026986939",
  leadgenId: "555000111222333",
  crmASecret: "test_downstream_secret_A_0123456789abcdef",
  crmBSecret: "test_downstream_secret_B_0123456789abcdef",
  internal: "test_internal_secret",
};

export const testEnv = {
  META_APP_ID: "1842181417134760",
  META_APP_SECRET: T.appSecret,
  META_ACCESS_TOKEN: T.token,
  META_WEBHOOK_VERIFY_TOKEN: T.verify,
  META_PAGE_ID: T.pageId,
  META_GRAPH_API_VERSION: "v26.0",
  META_ALLOWED_FORM_IDS: T.formId,
  META_INTERNAL_SECRET: T.internal,
  META_INTERNAL_MODE: "live",
};

export function cfg(extra: Record<string, string> = {}): MetaConfig {
  return loadMetaConfig({ ...testEnv, ...extra });
}

export function notification(opts: { pageId?: string; formId?: string; leadgenId?: string; field?: string; object?: string } = {}) {
  return {
    object: opts.object ?? "page",
    entry: [
      {
        id: opts.pageId ?? T.pageId,
        time: 1760000000,
        changes: [
          {
            field: opts.field ?? "leadgen",
            value: {
              leadgen_id: opts.leadgenId ?? T.leadgenId,
              page_id: opts.pageId ?? T.pageId,
              form_id: opts.formId ?? T.formId,
              ad_id: "120200000000001",
              adgroup_id: "120200000000002",
              created_time: 1760000000,
            },
          },
        ],
      },
    ],
  };
}

export const rawOf = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8");
export const signed = (raw: Buffer, secret = T.appSecret) => metaSignature(raw, secret);
export const internalHeaders = (secret: string, body: string, ts = String(Math.floor(Date.now() / 1000))) => ({ ts, sig: signInternal(secret, ts, body) });

export function graphLead(over: Record<string, unknown> = {}) {
  return {
    id: T.leadgenId,
    created_time: "2026-10-14T10:00:00+0000",
    form_id: T.formId,
    ad_id: "120200000000001",
    campaign_name: "Catalogo autunno",
    field_data: [
      { name: "full_name", values: ["Mario Rossi"] },
      { name: "phone_number", values: ["+393331112233"] },
      { name: "email", values: ["Mario@Example.com"] },
      { name: "citta", values: ["Torino"] },
    ],
    ...over,
  };
}

// ------------------------------------------------------------------ store in memoria
export class MemoryStore implements MetaStore {
  constructor(public now: () => Date = () => new Date()) {}
  deliveries = new Map<string, DeliveryRow>();
  downstreams = new Map<string, DownstreamRow>();
  private n = 0;
  failPersist = false;

  async upsertReceived(ev: LeadgenEvent, eventJson: string, now: Date, origine: Origine = "META") {
    if (this.failPersist) throw new Error("db down");
    const ex = [...this.deliveries.values()].find((d) => d.leadgenId === ev.leadgenId);
    if (ex) return { id: ex.id, stato: ex.stato, isNew: false };
    const id = `d${++this.n}`;
    this.deliveries.set(id, {
      id, origine, leadgenId: ev.leadgenId, pageId: ev.pageId, formId: ev.formId, adId: ev.adId ?? null, adgroupId: ev.adgroupId ?? null,
      createdTimeMeta: null, stato: "RECEIVED", tentativi: 0, erroreCodice: null, retriabile: true, nextRetryAt: null,
      eventJson, leadJson: null, leadId: null, receivedAt: now, updatedAt: now,
    });
    return { id, stato: "RECEIVED" as DeliveryStato, isNew: true };
  }
  async claim(id: string, staleBefore: Date) {
    const d = this.deliveries.get(id);
    if (!d) return null;
    const ok = d.stato === "RECEIVED" || (d.stato === "FAILED" && d.retriabile) || (d.stato === "PROCESSING" && d.updatedAt < staleBefore);
    if (!ok) return null;
    d.stato = "PROCESSING"; d.tentativi++; d.nextRetryAt = null; d.updatedAt = this.now();
    return { ...d };
  }
  async saveLead(id: string, leadJson: string) { this.deliveries.get(id)!.leadJson = leadJson; }
  async markProcessed(id: string, leadId: string | null) { Object.assign(this.deliveries.get(id)!, { stato: "PROCESSED", leadId, erroreCodice: null, nextRetryAt: null }); }
  async markFailed(id: string, code: string, retriabile: boolean, nextRetryAt: Date | null) {
    Object.assign(this.deliveries.get(id)!, { stato: "FAILED", erroreCodice: code, retriabile, nextRetryAt });
  }
  async ensureDownstreams(deliveryId: string, names: string[]) {
    for (const destinatario of names) {
      if ([...this.downstreams.values()].some((x) => x.deliveryId === deliveryId && x.destinatario === destinatario)) continue;
      const id = `s${++this.n}`;
      this.downstreams.set(id, { id, deliveryId, destinatario, stato: "PENDING", tentativi: 0, erroreCodice: null, retriabile: true, nextRetryAt: null, deliveredAt: null });
    }
  }
  async getDownstreams(deliveryId: string) { return [...this.downstreams.values()].filter((x) => x.deliveryId === deliveryId).map((x) => ({ ...x })); }
  async listRetryableDeliveries(receivedBefore: Date, staleBefore: Date, limit: number) {
    const now = this.now();
    return [...this.deliveries.values()]
      .filter((d) => (d.stato === "RECEIVED" && d.receivedAt < receivedBefore) || (d.stato === "FAILED" && d.retriabile && d.nextRetryAt && d.nextRetryAt <= now) || (d.stato === "PROCESSING" && d.updatedAt < staleBefore))
      .slice(0, limit).map((d) => d.id);
  }
  async listDueDownstreams(now: Date, limit: number) {
    return [...this.downstreams.values()]
      .filter((x) => this.deliveries.get(x.deliveryId)!.stato === "PROCESSED" && ((x.stato === "PENDING" && (!x.nextRetryAt || x.nextRetryAt <= now)) || (x.stato === "FAILED" && x.retriabile && x.nextRetryAt && x.nextRetryAt <= now)))
      .slice(0, limit).map((x) => ({ row: { ...x }, delivery: { ...this.deliveries.get(x.deliveryId)! } }));
  }
  async requeueDeliveries(now: Date) {
    let n = 0;
    for (const d of this.deliveries.values()) if (d.stato === "FAILED" && !d.retriabile) { Object.assign(d, { retriabile: true, tentativi: 0, nextRetryAt: now }); n++; }
    return n;
  }
  async requeueDownstreams(now: Date, destinatario?: string) {
    let n = 0;
    for (const x of this.downstreams.values()) if (x.stato === "FAILED" && !x.retriabile && (!destinatario || x.destinatario === destinatario)) { Object.assign(x, { retriabile: true, tentativi: 0, nextRetryAt: now }); n++; }
    return n;
  }
  async stats() {
    const deliveries: Record<string, number> = {};
    for (const d of this.deliveries.values()) deliveries[d.stato] = (deliveries[d.stato] ?? 0) + 1;
    return { deliveries, downstreams: [] };
  }
  async claimDownstream(id: string, now: Date, leaseMs: number) {
    const x = this.downstreams.get(id)!;
    const due = (x.stato === "PENDING" && (!x.nextRetryAt || x.nextRetryAt <= now)) || (x.stato === "FAILED" && x.retriabile && !!x.nextRetryAt && x.nextRetryAt <= now);
    if (!due) return null;
    x.tentativi++; x.nextRetryAt = new Date(now.getTime() + leaseMs);
    return x.tentativi;
  }
  async markDownstreamDelivered(id: string) { Object.assign(this.downstreams.get(id)!, { stato: "DELIVERED", deliveredAt: this.now(), erroreCodice: null, nextRetryAt: null }); }
  async markDownstreamFailed(id: string, code: string, retriabile: boolean, nextRetryAt: Date | null) { Object.assign(this.downstreams.get(id)!, { stato: "FAILED", erroreCodice: code, retriabile, nextRetryAt }); }
}

export class MemoryInbound implements InboundStore {
  events = new Map<string, { mode: string; leadId: string | null }>();
  async record(i: { eventId: string; mode: "shadow" | "live" }) {
    const ex = this.events.get(i.eventId);
    if (ex) return { isNew: false, mode: ex.mode, leadId: ex.leadId };
    this.events.set(i.eventId, { mode: i.mode, leadId: null });
    return { isNew: true, mode: i.mode, leadId: null };
  }
  async attachLead(eventId: string, leadId: string) { this.events.get(eventId)!.leadId = leadId; }
}

export class MemorySink implements LeadSink {
  leads = new Map<string, IngestInput & { id: string }>();
  async ingest(i: IngestInput): Promise<IngestResult> {
    const ex = this.leads.get(i.externalId);
    if (ex) return { ok: true, leadId: ex.id, duplicate: true };
    if (!i.telefono && !i.email) return { ok: false, retriable: false, code: "lead_senza_contatto" };
    const id = `L${this.leads.size + 1}`;
    this.leads.set(i.externalId, { ...i, id });
    return { ok: true, leadId: id, duplicate: false };
  }
}

export type Call = { url: string; init: RequestInit };
export function makeDeps(opts: {
  config?: MetaConfig;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => Date;
} = {}) {
  const logs: string[] = [];
  const calls: Call[] = [];
  const clock = { t: new Date("2026-10-14T10:00:00Z").getTime() };
  const nowFn = opts.now ?? (() => new Date(clock.t));
  const store = new MemoryStore(nowFn);
  const sink = new MemorySink();
  const inbound = new MemoryInbound();
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    if (!opts.fetchImpl) throw new Error("no fetch stub");
    return opts.fetchImpl(String(url), init);
  }) as unknown as typeof fetch;
  const deps: Deps = {
    cfg: opts.config ?? cfg(),
    store, sink, inbound, fetchImpl, random: () => 0.5,
    now: nowFn,
    log: (code, meta) => logs.push(JSON.stringify({ code, ...meta })),
  };
  return { deps, store, sink, inbound, logs, calls, clock };
}

export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
