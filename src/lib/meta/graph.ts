import type { GraphLead, LeadgenEvent } from "./types";
import type { MetaConfig } from "./config";
import { appSecretProof } from "./signature";

export type GraphResult = { ok: true; lead: GraphLead } | { ok: false; retriable: boolean; code: string };

// Codici Graph API tipicamente temporanei: errore interno, servizio non disponibile, rate limit.
const TEMP_GRAPH_CODES = new Set([1, 2, 4, 17, 32, 341, 368, 613, 80004]);

/**
 * Recupera il lead completo da Graph API con Authorization: Bearer + appsecret_proof.
 * Il token NON compare mai nell'URL. Le risposte non vengono mai loggate né restituite nei codici d'errore.
 */
export async function fetchLead(
  ev: LeadgenEvent,
  cfg: Pick<MetaConfig, "accessToken" | "appSecret" | "graphVersion" | "graphBaseUrl">,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<GraphResult> {
  if (!cfg.accessToken || !cfg.appSecret) return { ok: false, retriable: true, code: "config_missing" };
  const proof = appSecretProof(cfg.accessToken, cfg.appSecret);
  const fields = "id,created_time,form_id,ad_id,campaign_name,field_data";
  const url = `${cfg.graphBaseUrl}/${cfg.graphVersion}/${encodeURIComponent(ev.leadgenId)}?fields=${fields}&appsecret_proof=${proof}`;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, retriable: true, code: "graph_network" };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const e = (json as { error?: { code?: number } } | null)?.error;
    const gcode = typeof e?.code === "number" ? e.code : undefined;
    const retriable = res.status >= 500 || res.status === 429 || res.status === 408 || (gcode !== undefined && TEMP_GRAPH_CODES.has(gcode));
    return { ok: false, retriable, code: gcode !== undefined ? `graph_${res.status}_c${gcode}` : `graph_${res.status}` };
  }

  const d = json as Partial<GraphLead> | null;
  if (!d || typeof d !== "object" || typeof d.id !== "string" || typeof d.form_id !== "string" || !Array.isArray(d.field_data)) {
    return { ok: false, retriable: false, code: "graph_shape" };
  }
  // Il lead recuperato deve coincidere con la notifica.
  if (d.id !== ev.leadgenId) return { ok: false, retriable: false, code: "lead_id_mismatch" };
  if (ev.formId && d.form_id !== ev.formId) return { ok: false, retriable: false, code: "form_id_mismatch" };

  const field_data = (d.field_data as unknown[])
    .filter((f): f is { name: string; values: unknown[] } => !!f && typeof (f as { name?: unknown }).name === "string")
    .map((f) => ({ name: f.name, values: Array.isArray(f.values) ? f.values.filter((x) => typeof x === "string").map(String) : [] }));

  return {
    ok: true,
    lead: {
      id: d.id,
      form_id: d.form_id,
      created_time: typeof d.created_time === "string" ? d.created_time : undefined,
      ad_id: typeof d.ad_id === "string" ? d.ad_id : undefined,
      campaign_name: typeof d.campaign_name === "string" ? d.campaign_name : undefined,
      field_data,
    },
  };
}

export type FormLeadsPage = { ok: true; leads: GraphLead[]; after: string | null } | { ok: false; retriable: boolean; code: string };

/**
 * Lettura (SOLA LETTURA) dei lead di un modulo: GET /{form_id}/leads. Ordine Graph: dal più recente.
 * Non segue mai l'URL "next" restituito da Meta (contiene il token): la paginazione usa solo il cursore.
 */
export async function fetchFormLeads(
  formId: string,
  cfg: Pick<MetaConfig, "accessToken" | "appSecret" | "graphVersion" | "graphBaseUrl">,
  fetchImpl: typeof fetch = fetch,
  opts: { sinceSec?: number; after?: string | null; limit?: number; timeoutMs?: number } = {},
): Promise<FormLeadsPage> {
  if (!cfg.accessToken || !cfg.appSecret) return { ok: false, retriable: true, code: "config_missing" };
  if (!/^\d+$/.test(formId)) return { ok: false, retriable: false, code: "invalid_form_id" };
  const proof = appSecretProof(cfg.accessToken, cfg.appSecret);
  const q = new URLSearchParams({ fields: "id,created_time,form_id,ad_id,campaign_name,field_data", limit: String(Math.min(100, opts.limit ?? 100)), appsecret_proof: proof });
  if (opts.sinceSec) q.set("filtering", JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: opts.sinceSec }]));
  if (opts.after && /^[A-Za-z0-9=_\-]{1,300}$/.test(opts.after)) q.set("after", opts.after);
  const url = `${cfg.graphBaseUrl}/${cfg.graphVersion}/${formId}/leads?${q.toString()}`;

  let res: Response;
  try {
    res = await fetchImpl(url, { method: "GET", headers: { Authorization: `Bearer ${cfg.accessToken}`, Accept: "application/json" }, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
  } catch {
    return { ok: false, retriable: true, code: "graph_network" };
  }
  let json: unknown = null;
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok) {
    const e = (json as { error?: { code?: number } } | null)?.error;
    const gcode = typeof e?.code === "number" ? e.code : undefined;
    const retriable = res.status >= 500 || res.status === 429 || res.status === 408 || (gcode !== undefined && TEMP_GRAPH_CODES.has(gcode));
    return { ok: false, retriable, code: gcode !== undefined ? `graph_${res.status}_c${gcode}` : `graph_${res.status}` };
  }
  const body = json as { data?: unknown; paging?: { cursors?: { after?: unknown }; next?: unknown } } | null;
  if (!body || !Array.isArray(body.data)) return { ok: false, retriable: false, code: "graph_shape" };
  const leads: GraphLead[] = [];
  for (const d of body.data as Partial<GraphLead>[]) {
    if (!d || typeof d.id !== "string" || !/^\d+$/.test(d.id) || d.form_id !== formId || !Array.isArray(d.field_data)) continue; // scarta righe incoerenti
    leads.push({
      id: d.id,
      form_id: d.form_id,
      created_time: typeof d.created_time === "string" ? d.created_time : undefined,
      ad_id: typeof d.ad_id === "string" ? d.ad_id : undefined,
      campaign_name: typeof d.campaign_name === "string" ? d.campaign_name : undefined,
      field_data: (d.field_data as unknown[])
        .filter((f): f is { name: string; values: unknown[] } => !!f && typeof (f as { name?: unknown }).name === "string")
        .map((f) => ({ name: f.name, values: Array.isArray(f.values) ? f.values.filter((x) => typeof x === "string").map(String) : [] })),
    });
  }
  const after = body.paging?.next && typeof body.paging.cursors?.after === "string" ? body.paging.cursors.after : null;
  return { ok: true, leads, after };
}

export type ModuloGraph = { id: string; nome: string; stato: string | null; leadTotali: number | null; creatoIl: string | null };
export type PaginaGraph = { id: string; nome: string | null; moduli: ModuloGraph[]; errore?: string };

/**
 * Moduli istantanei di una pagina (SOLA LETTURA): GET /{page}/leadgen_forms. Prima con il token di sistema; se Meta chiede
 * il token della pagina, lo legge (GET /{page}?fields=access_token) e riprova. Nessun token nei risultati né nei codici d'errore.
 */
export async function fetchPageForms(
  pageId: string,
  cfg: Pick<MetaConfig, "accessToken" | "appSecret" | "graphVersion" | "graphBaseUrl">,
  fetchImpl: typeof fetch = fetch,
): Promise<PaginaGraph> {
  if (!cfg.accessToken || !cfg.appSecret) return { id: pageId, nome: null, moduli: [], errore: "config_missing" };
  if (!/^\d+$/.test(pageId)) return { id: pageId, nome: null, moduli: [], errore: "invalid_page_id" };
  const base = `${cfg.graphBaseUrl}/${cfg.graphVersion}`;
  const leggi = async (path: string, token: string, q: Record<string, string>) => {
    const qs = new URLSearchParams({ ...q, appsecret_proof: appSecretProof(token, cfg.appSecret!) });
    try {
      const res = await fetchImpl(`${base}/${path}?${qs}`, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const c = (json?.error as { code?: number } | undefined)?.code;
        return { ok: false as const, code: typeof c === "number" ? `graph_${res.status}_c${c}` : `graph_${res.status}` };
      }
      return { ok: true as const, json: json ?? {} };
    } catch {
      return { ok: false as const, code: "graph_network" };
    }
  };
  const campi = { fields: "id,name,status,leads_count,created_time", limit: "100" };
  const info = await leggi(pageId, cfg.accessToken, { fields: "name,access_token" });
  const nome = info.ok && typeof info.json.name === "string" ? info.json.name : null;
  const tokenPagina = info.ok && typeof info.json.access_token === "string" ? info.json.access_token : null;
  let r = await leggi(`${pageId}/leadgen_forms`, cfg.accessToken, campi);
  if (!r.ok && tokenPagina) r = await leggi(`${pageId}/leadgen_forms`, tokenPagina, campi);
  if (!r.ok) return { id: pageId, nome, moduli: [], errore: r.code };
  const dati = Array.isArray(r.json.data) ? (r.json.data as Record<string, unknown>[]) : [];
  const moduli = dati
    .filter((f) => typeof f.id === "string" && /^\d+$/.test(f.id))
    .map((f) => ({
      id: f.id as string,
      nome: typeof f.name === "string" ? f.name.slice(0, 200) : `Modulo ${f.id}`,
      stato: typeof f.status === "string" ? f.status : null,
      leadTotali: typeof f.leads_count === "number" ? f.leads_count : null,
      creatoIl: typeof f.created_time === "string" ? f.created_time : null,
    }));
  return { id: pageId, nome, moduli };
}

export type IscrizionePagina = { id: string; nome: string | null; iscritta: boolean | null; campi: string[]; errore?: string };

/**
 * SOLA LETTURA: la pagina manda i lead a questa app? GET /{page}/subscribed_apps (con il token della pagina).
 * Non iscrive niente: iscrivere una pagina è una modifica a Meta che si fa solo su autorizzazione.
 */
export async function fetchPageSubscription(
  pageId: string,
  cfg: Pick<MetaConfig, "accessToken" | "appSecret" | "graphVersion" | "graphBaseUrl" | "appId">,
  fetchImpl: typeof fetch = fetch,
): Promise<IscrizionePagina> {
  if (!cfg.accessToken || !cfg.appSecret) return { id: pageId, nome: null, iscritta: null, campi: [], errore: "config_missing" };
  if (!/^\d+$/.test(pageId)) return { id: pageId, nome: null, iscritta: null, campi: [], errore: "invalid_page_id" };
  const base = `${cfg.graphBaseUrl}/${cfg.graphVersion}`;
  const leggi = async (path: string, token: string, q: Record<string, string>) => {
    const qs = new URLSearchParams({ ...q, appsecret_proof: appSecretProof(token, cfg.appSecret!) });
    try {
      const res = await fetchImpl(`${base}/${path}?${qs}`, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const c = (json?.error as { code?: number } | undefined)?.code;
        return { ok: false as const, code: typeof c === "number" ? `graph_${res.status}_c${c}` : `graph_${res.status}` };
      }
      return { ok: true as const, json: json ?? {} };
    } catch {
      return { ok: false as const, code: "graph_network" };
    }
  };
  const info = await leggi(pageId, cfg.accessToken, { fields: "name,access_token" });
  const nome = info.ok && typeof info.json.name === "string" ? info.json.name : null;
  const tokenPagina = info.ok && typeof info.json.access_token === "string" ? info.json.access_token : null;
  if (!info.ok) return { id: pageId, nome, iscritta: null, campi: [], errore: info.code };
  const r = await leggi(`${pageId}/subscribed_apps`, tokenPagina ?? cfg.accessToken, { fields: "id,name,subscribed_fields" });
  if (!r.ok) return { id: pageId, nome, iscritta: null, campi: [], errore: r.code };
  const app = (Array.isArray(r.json.data) ? (r.json.data as Record<string, unknown>[]) : []).find((a) => !cfg.appId || a.id === cfg.appId);
  const campi = Array.isArray(app?.subscribed_fields) ? (app!.subscribed_fields as unknown[]).filter((x): x is string => typeof x === "string") : [];
  return { id: pageId, nome, iscritta: !!app && campi.includes("leadgen"), campi };
}
