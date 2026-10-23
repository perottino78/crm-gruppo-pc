// Configurazione SOLO da variabili d'ambiente. Nessun valore sensibile nel codice, nei commit o nei log.
export type Mode = "shadow" | "live";
export type Downstream = { name: string; url: string; secret: string; mode: Mode };

export type MetaConfig = {
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  verifyToken?: string;
  /** Primo pageId (retrocompatibilità e polling). */
  pageId?: string;
  /** Lista di tutti i pageId autorizzati (da META_PAGE_ID separato da virgola). */
  pageIds: string[];
  graphVersion: string;
  allowedFormIds: string[];
  /** CRM a valle (fan-out). Vuoto = nessun inoltro. */
  downstreams: Downstream[];
  downstreamsInvalid: string[]; // nomi con configurazione incompleta (solo nomi)
  /** Segreto HMAC con cui QUESTO CRM accetta eventi interni firmati da un gateway. */
  internalSecret?: string;
  /** Segreto successivo, accettato in parallelo durante la rotazione senza fermo. */
  internalSecretNext?: string;
  /** Modalità con cui QUESTO CRM tratta gli eventi interni: in "shadow" registra senza creare lead. Default shadow. */
  inboundMode: Mode;
  /** Segreto (>= 32 caratteri) dell'endpoint scheduler: Authorization: Bearer ... (Vercel Cron). */
  schedulerSecret?: string;
  /** Chiavi di firma Upstash QStash (alternativa a Vercel Cron). */
  qstashKeys: string[];
  /** Solo test/sviluppo: base URL Graph alternativa. Ignorata in produzione. */
  graphBaseUrl: string;
  /** Se false questo servizio fa solo da gateway e non crea lead locali. */
  localIngest: boolean;
  /** Lettura periodica (sola lettura) dei moduli lead via Graph: alternativa al webhook, senza toccare la configurazione Meta. */
  pollEnabled: boolean;
  /** I lead letti in polling vanno ai CRM in "live" SOLO se true. Default false = sempre shadow. */
  pollLive: boolean;
  /** Ignora lead creati prima di questa data (ISO). Assente = ultime `pollLookbackHours`. */
  pollSince?: Date;
  pollLookbackHours: number;
  /** Il polling ignora i lead più giovani di così (minuti): il webhook ha sempre la precedenza. */
  pollMinAgeMinutes: number;
  defaultBrand: string;
  formBrands: Record<string, string>;
  /** Mappa pageId → brand (da META_PAGE_BRANDS, formato: pageId=Brand,pageId2=Brand2). Fallback quando formBrands non ha il formId. */
  pageBrands: Record<string, string>;
};

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
const strong = (v: string | undefined) => (v && v.length >= 32 ? v : undefined);

export function loadMetaConfig(env: Env = process.env): MetaConfig {
  const ver = clean(env.META_GRAPH_API_VERSION) ?? "v26.0";
  const graphVersion = /^v\d+\.\d+$/.test(ver) ? ver : "v26.0";

  const allowedFormIds = (clean(env.META_ALLOWED_FORM_IDS) ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^\d+$/.test(x));

  const downstreams: Downstream[] = [];
  const downstreamsInvalid: string[] = [];
  for (const raw of (clean(env.META_DOWNSTREAMS) ?? "").split(",")) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const url = clean(env[`META_DOWNSTREAM_${key}_URL`]);
    const secret = clean(env[`META_DOWNSTREAM_${key}_SECRET`]);
    const okUrl = !!url && (/^https:\/\//i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(url));
    const modeRaw = (clean(env[`META_DOWNSTREAM_${key}_MODE`]) ?? "shadow").toLowerCase();
    // Default sicuro: shadow. Si passa a live solo dichiarandolo esplicitamente.
    const mode: Mode = modeRaw === "live" ? "live" : "shadow";
    if (okUrl && secret && secret.length >= 32) downstreams.push({ name, url: url!, secret, mode });
    else downstreamsInvalid.push(name);
  }

  const formBrands: Record<string, string> = {};
  for (const pair of (clean(env.META_FORM_BRANDS) ?? "").split(",")) {
    const [f, b] = pair.split("=");
    if (f && b && /^\d+$/.test(f.trim())) formBrands[f.trim()] = b.trim();
  }

  const pageBrands: Record<string, string> = {};
  for (const pair of (clean(env.META_PAGE_BRANDS) ?? "").split(",")) {
    const [p, b] = pair.split("=");
    if (p && b && /^\d+$/.test(p.trim())) pageBrands[p.trim()] = b.trim();
  }

  const pageIds = [
    ...(clean(env.META_PAGE_ID) ?? "").split(",").map((x) => x.trim()).filter((x) => /^\d+$/.test(x)),
    ...(clean(env.META_EXTRA_PAGE_IDS) ?? "").split(",").map((x) => x.trim()).filter((x) => /^\d+$/.test(x)),
  ];

  return {
    appId: clean(env.META_APP_ID),
    appSecret: clean(env.META_APP_SECRET),
    accessToken: clean(env.META_ACCESS_TOKEN),
    verifyToken: clean(env.META_WEBHOOK_VERIFY_TOKEN),
    pageId: pageIds[0],
    pageIds,
    graphVersion,
    allowedFormIds,
    downstreams,
    downstreamsInvalid,
    internalSecret: clean(env.META_INTERNAL_SECRET),
    internalSecretNext: clean(env.META_INTERNAL_SECRET_NEXT),
    inboundMode: (clean(env.META_INTERNAL_MODE) ?? "shadow").toLowerCase() === "live" ? "live" : "shadow",
    schedulerSecret: strong(clean(env.META_SCHEDULER_SECRET) ?? clean(env.META_RETRY_SECRET) ?? clean(env.CRON_SECRET)),
    qstashKeys: [clean(env.QSTASH_CURRENT_SIGNING_KEY), clean(env.QSTASH_NEXT_SIGNING_KEY)].filter((x): x is string => !!x),
    graphBaseUrl:
      env.NODE_ENV === "production" ? "https://graph.facebook.com" : (clean(env.META_GRAPH_BASE_URL) ?? "https://graph.facebook.com"),
    localIngest: (clean(env.META_LOCAL_INGEST) ?? "true").toLowerCase() !== "false",
    pollEnabled: (clean(env.META_POLL_ENABLED) ?? "false").toLowerCase() === "true",
    pollLive: (clean(env.META_POLL_LIVE) ?? "false").toLowerCase() === "true",
    pollSince: (() => { const d = clean(env.META_POLL_SINCE) ? new Date(clean(env.META_POLL_SINCE)!) : undefined; return d && !Number.isNaN(d.getTime()) ? d : undefined; })(),
    pollLookbackHours: Math.min(24 * 30, Math.max(1, Number(clean(env.META_POLL_LOOKBACK_HOURS)) || 48)),
    pollMinAgeMinutes: (() => { const n = Number(clean(env.META_POLL_MIN_AGE_MINUTES)); return Number.isFinite(n) && n >= 0 ? Math.min(n, 24 * 60) : 10; })(),
    defaultBrand: clean(env.META_DEFAULT_BRAND) ?? "P&C",
    formBrands,
    pageBrands,
  };
}

/** Stato delle variabili (solo presente/assente), per la pagina diagnostica admin. Mai i valori. */
export function configPresence(env: Env = process.env): { name: string; set: boolean; required: boolean }[] {
  const req = ["META_APP_ID", "META_APP_SECRET", "META_ACCESS_TOKEN", "META_WEBHOOK_VERIFY_TOKEN", "META_PAGE_ID", "META_ALLOWED_FORM_IDS"];
  const opt = ["META_GRAPH_API_VERSION", "META_DOWNSTREAMS", "META_INTERNAL_SECRET", "META_INTERNAL_SECRET_NEXT", "META_INTERNAL_MODE", "META_SCHEDULER_SECRET", "QSTASH_CURRENT_SIGNING_KEY", "META_LOCAL_INGEST", "META_POLL_ENABLED", "META_POLL_LIVE", "META_POLL_SINCE", "META_POLL_LOOKBACK_HOURS", "META_POLL_MIN_AGE_MINUTES", "META_DEFAULT_BRAND", "META_FORM_BRANDS", "META_PAGE_BRANDS", "META_EXTRA_PAGE_IDS"];
  return [...req.map((n) => ({ name: n, set: !!clean(env[n]), required: true })), ...opt.map((n) => ({ name: n, set: !!clean(env[n]), required: false }))];
}
