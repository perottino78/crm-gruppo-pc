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
