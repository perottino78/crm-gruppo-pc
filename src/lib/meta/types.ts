export type LeadgenEvent = {
  leadgenId: string;
  pageId: string;
  formId: string;
  adId?: string;
  adgroupId?: string;
  createdTime?: number; // unix seconds
};

export type GraphFieldData = { name: string; values: string[] };
export type GraphLead = {
  id: string;
  created_time?: string;
  form_id: string;
  ad_id?: string;
  campaign_name?: string;
  field_data: GraphFieldData[];
};

export type DeliveryStato = "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED";
export type DownstreamStato = "PENDING" | "DELIVERED" | "FAILED";

export type Origine = "META" | "REPLAY" | "POLL";
export type DeliveryRow = {
  id: string;
  origine: Origine;
  leadgenId: string;
  pageId: string;
  formId: string;
  adId: string | null;
  adgroupId: string | null;
  createdTimeMeta: Date | null;
  stato: DeliveryStato;
  tentativi: number;
  erroreCodice: string | null;
  retriabile: boolean;
  nextRetryAt: Date | null;
  eventJson: string;
  leadJson: string | null;
  leadId: string | null;
  receivedAt: Date;
  updatedAt: Date;
};

export type DownstreamRow = {
  id: string;
  deliveryId: string;
  destinatario: string;
  stato: DownstreamStato;
  tentativi: number;
  erroreCodice: string | null;
  retriabile: boolean;
  nextRetryAt: Date | null;
  deliveredAt: Date | null;
};

// Persistenza astratta: implementata con Prisma in produzione e in memoria nei test.
export interface MetaStore {
  upsertReceived(ev: LeadgenEvent, eventJson: string, now: Date, origine?: Origine): Promise<{ id: string; stato: DeliveryStato; isNew: boolean }>;
  /** Passa RECEIVED/FAILED(retriabile)/PROCESSING(scaduto) a PROCESSING incrementando i tentativi. Atomico. */
  claim(id: string, staleBefore: Date): Promise<DeliveryRow | null>;
  saveLead(id: string, leadJson: string): Promise<void>;
  markProcessed(id: string, leadId: string | null): Promise<void>;
  markFailed(id: string, code: string, retriabile: boolean, nextRetryAt: Date | null): Promise<void>;
  ensureDownstreams(deliveryId: string, names: string[]): Promise<void>;
  getDownstreams(deliveryId: string): Promise<DownstreamRow[]>;
  listRetryableDeliveries(now: Date, staleBefore: Date, limit: number): Promise<string[]>;
  listDueDownstreams(now: Date, limit: number): Promise<{ row: DownstreamRow; delivery: DeliveryRow }[]>;
  /** Lease atomica: un solo chiamante ottiene il tentativo (restituisce il numero di tentativo), gli altri null. */
  claimDownstream(id: string, now: Date, leaseMs: number): Promise<number | null>;
  markDownstreamDelivered(id: string): Promise<void>;
  markDownstreamFailed(id: string, code: string, retriabile: boolean, nextRetryAt: Date | null): Promise<void>;
  /** Rimette in coda i FAILED non più ritentabili (dopo aver risolto la causa). Restituisce quanti. */
  requeueDeliveries(now: Date): Promise<number>;
  requeueDownstreams(now: Date, destinatario?: string): Promise<number>;
  stats(): Promise<StoreStats>;
}

export type StoreStats = {
  deliveries: Record<string, number>;
  downstreams: { destinatario: string; stato: string; count: number }[];
};

/** Registro degli eventi interni ricevuti (lato CRM destinatario). */
export interface InboundStore {
  record(i: { eventId: string; leadgenId: string; pageId: string; formId: string; mode: "shadow" | "live" }, now: Date): Promise<{ isNew: boolean; mode: string; leadId: string | null }>;
  attachLead(eventId: string, leadId: string): Promise<void>;
}

export type IngestInput = {
  externalId: string; // leadgen_id
  nome: string;
  telefono: string | null;
  email: string | null;
  brand: string;
  note: string | null;
  formId: string;
  adId: string | null;
};
export type IngestResult =
  | { ok: true; leadId: string; duplicate: boolean }
  | { ok: false; retriable: boolean; code: string };
export interface LeadSink {
  ingest(input: IngestInput): Promise<IngestResult>;
}

export type Logger = (code: string, meta?: Record<string, string | number | boolean | null | undefined>) => void;
