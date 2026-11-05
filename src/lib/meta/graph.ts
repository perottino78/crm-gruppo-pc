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
export type PaginaGraph = { id: string; nome: string | null; moduli: ModuloGraph[]; errore?: string; iscritta?: boolean | null };

/**
 * Moduli istantanei di una pagina (SOLA LETTURA): GET /{page}/leadgen_forms. Prima con il token di sistema; se Meta chiede
 * il token della pagina, lo legge (GET /{page}?fields=access_token) e riprova. Nessun token nei risultati né nei codici d'errore.
 */
export async function fetchPageForms(
  pageId: string,
  cfg: Pick<MetaConfig, "accessToken" | "appSecret" | "graphVersion" | "graphBaseUrl">,
  fetchImpl: typeof fetch = fetch,
  tokenPaginaNoto?: string,
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
  const info = await leggi(pageId, tokenPaginaNoto ?? cfg.accessToken, { fields: tokenPaginaNoto ? "name" : "name,access_token" });
  const nome = info.ok && typeof info.json.name === "string" ? info.json.name : null;
  const tokenPagina = tokenPaginaNoto ?? (info.ok && typeof info.json.access_token === "string" ? info.json.access_token : null);
  let r = await leggi(`${pageId}/leadgen_forms`, tokenPaginaNoto ?? cfg.accessToken, campi);
  if (!r.ok && tokenPagina && !tokenPaginaNoto) r = await leggi(`${pageId}/leadgen_forms`, tokenPagina, campi);
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

export type IscrizionePagina = { id: string; nome: string | null; iscritta: boolean | null; campi: string[]; app?: string[]; errore?: string };

/**
 * SOLA LETTURA: la pagina manda i lead a questa app? GET /{page}/subscribed_apps (con il token della pagina).
 * Non iscrive niente: iscrivere una pagina è una modifica a Meta che si fa solo su autorizzazione.
 */
export async function fetchPageSubscription(
  pageId: string,
  cfg: Pick<MetaConfig, "accessToken" | "appSecret" | "graphVersion" | "graphBaseUrl" | "appId">,
  fetchImpl: typeof fetch = fetch,
  tokenPaginaNoto?: string,
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
  const info = await leggi(pageId, tokenPaginaNoto ?? cfg.accessToken, { fields: tokenPaginaNoto ? "name" : "name,access_token" });
  const nome = info.ok && typeof info.json.name === "string" ? info.json.name : null;
  const tokenPagina = tokenPaginaNoto ?? (info.ok && typeof info.json.access_token === "string" ? info.json.access_token : null);
  if (!info.ok) return { id: pageId, nome, iscritta: null, campi: [], errore: info.code };
  const r = await leggi(`${pageId}/subscribed_apps`, tokenPagina ?? cfg.accessToken, { fields: "id,name,subscribed_fields" });
  if (!r.ok) return { id: pageId, nome, iscritta: null, campi: [], errore: r.code };
  const tutte = Array.isArray(r.json.data) ? (r.json.data as Record<string, unknown>[]) : [];
  const app = tutte.find((a) => !cfg.appId || a.id === cfg.appId);
  const campi = Array.isArray(app?.subscribed_fields) ? (app!.subscribed_fields as unknown[]).filter((x): x is string => typeof x === "string") : [];
  // nomi delle app iscritte alla pagina (per riconoscere in Meta Business quale app usa P&C ONE)
  const nomi = tutte.map((a) => `${typeof a.name === "string" ? a.name : "?"} (${typeof a.id === "string" ? a.id : "?"})`);
  return { id: pageId, nome, iscritta: !!app && campi.includes("leadgen"), campi, app: nomi };
}

/** SOLA LETTURA: con quale app e quale utente il gateway parla con Meta (solo nomi e ID, mai token). */
export async function fetchIdentita(cfg: Pick<MetaConfig, "accessToken" | "appSecret" | "graphVersion" | "graphBaseUrl">, fetchImpl: typeof fetch = fetch) {
  if (!cfg.accessToken || !cfg.appSecret) return { errore: "config_missing" };
  const proof = appSecretProof(cfg.accessToken, cfg.appSecret);
  const leggi = async (path: string, fields: string) => {
    try {
      const res = await fetchImpl(`${cfg.graphBaseUrl}/${cfg.graphVersion}/${path}?fields=${fields}&appsecret_proof=${proof}`, { headers: { Authorization: `Bearer ${cfg.accessToken}` }, signal: AbortSignal.timeout(10_000) });
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) return { errore: `graph_${res.status}_c${(j?.error as { code?: number } | undefined)?.code ?? ""}` };
      return { id: typeof j?.id === "string" ? j.id : null, nome: typeof j?.name === "string" ? j.name : null };
    } catch {
      return { errore: "graph_network" };
    }
  };
  return { utente: await leggi("me", "id,name"), app: await leggi("app", "id,name") };
}

export type PaginaConChiave = { id: string; nome: string; token: string };

/**
 * Da una chiave incollata (token utente o di pagina, generato nello strumento Graph API Explorer per l'app del CRM):
 * 1) se è di un utente, la scambia con una a lunga durata (serve l'App Secret, che ha solo il gateway);
 * 2) ricava le chiavi delle pagine che quell'utente gestisce (dalla chiave lunga sono senza scadenza).
 * La chiave incollata non viene mai salvata; si restituiscono solo le chiavi delle pagine.
 */
export async function chiaviPagineDa(
  token: string,
  cfg: Pick<MetaConfig, "appSecret" | "appId" | "graphVersion" | "graphBaseUrl">,
  fetchImpl: typeof fetch = fetch,
  paginePossibili: string[] = [],
): Promise<{ ok: true; pagine: PaginaConChiave[]; lunga: boolean } | { ok: false; code: string }> {
  if (!cfg.appSecret) return { ok: false, code: "config_missing" };
  const t = token.trim();
  if (!/^[A-Za-z0-9_\-|.]{20,600}$/.test(t)) return { ok: false, code: "chiave_non_valida" };
  const base = `${cfg.graphBaseUrl}/${cfg.graphVersion}`;
  const get = async (url: string, tok?: string) => {
    try {
      const res = await fetchImpl(url, { method: "GET", headers: tok ? { Authorization: `Bearer ${tok}`, Accept: "application/json" } : { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
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
  const proof = (tok: string) => appSecretProof(tok, cfg.appSecret!);
  // chi è? (pagina o utente)
  const me = await get(`${base}/me?fields=id,name&appsecret_proof=${proof(t)}`, t);
  if (!me.ok) return { ok: false, code: me.code };
  // l'app della chiave deve essere quella del CRM
  const app = await get(`${base}/app?fields=id&appsecret_proof=${proof(t)}`, t);
  const appId = cfg.appId ?? (app.ok && typeof app.json.id === "string" ? app.json.id : undefined);
  if (app.ok && cfg.appId && app.json.id !== cfg.appId) return { ok: false, code: "app_diversa" };
  if (!appId) return { ok: false, code: "app_sconosciuta" };
  // scambio con chiave a lunga durata (per un token di pagina Meta risponde con un'altra chiave di pagina valida)
  const q = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: appId, client_secret: cfg.appSecret, fb_exchange_token: t });
  const ex = await get(`${base}/oauth/access_token?${q}`);
  const lunga = ex.ok && typeof ex.json.access_token === "string" ? (ex.json.access_token as string) : null;
  const tok = lunga ?? t;
  const trovate = new Map<string, PaginaConChiave>();
  const aggiungi = (dati: unknown) => {
    for (const p of Array.isArray(dati) ? (dati as Record<string, unknown>[]) : []) {
      if (typeof p.id === "string" && /^\d+$/.test(p.id) && typeof p.access_token === "string" && !trovate.has(p.id)) {
        trovate.set(p.id, { id: p.id, nome: typeof p.name === "string" ? p.name : `Pagina ${p.id}`, token: p.access_token });
      }
    }
  };
  // 1) pagine gestite direttamente dal profilo
  const acc = await get(`${base}/me/accounts?fields=id,name,access_token&limit=100&appsecret_proof=${proof(tok)}`, tok);
  if (acc.ok) aggiungi(acc.json.data);
  // 2) pagine del Business Manager (di proprietà o in gestione per clienti)
  const biz = await get(`${base}/me/businesses?fields=id&limit=50&appsecret_proof=${proof(tok)}`, tok);
  if (biz.ok && Array.isArray(biz.json.data)) {
    for (const b of (biz.json.data as Record<string, unknown>[]).slice(0, 10)) {
      if (typeof b.id !== "string" || !/^\d+$/.test(b.id)) continue;
      for (const tipo of ["owned_pages", "client_pages"]) {
        const r = await get(`${base}/${b.id}/${tipo}?fields=id,name,access_token&limit=100&appsecret_proof=${proof(tok)}`, tok);
        if (r.ok) aggiungi(r.json.data);
      }
    }
  }
  // 3) le pagine che il CRM conosce già (Gruppo P&C, Solaris…), chieste una per una
  for (const id of paginePossibili.filter((x) => /^\d+$/.test(x) && !trovate.has(x)).slice(0, 20)) {
    const r = await get(`${base}/${id}?fields=id,name,access_token&appsecret_proof=${proof(tok)}`, tok);
    if (r.ok) aggiungi([r.json]);
  }
  // 4) oppure è già la chiave di una pagina
  if (!trovate.size && typeof me.json.id === "string" && /^\d+$/.test(me.json.id)) {
    const p = await get(`${base}/${me.json.id}?fields=id,name,access_token&appsecret_proof=${proof(tok)}`, tok);
    if (p.ok && typeof p.json.access_token === "string") aggiungi([p.json]);
    else if (p.ok && typeof p.json.name === "string" && !("first_name" in p.json)) trovate.set(me.json.id, { id: me.json.id, nome: p.json.name, token: tok });
  }
  if (trovate.size) return { ok: true, pagine: [...trovate.values()], lunga: !!lunga };
  // niente: si spiega quali autorizzazioni mancano
  const perm = await get(`${base}/me/permissions?appsecret_proof=${proof(tok)}`, tok);
  const concesse = new Set(perm.ok && Array.isArray(perm.json.data) ? (perm.json.data as Record<string, unknown>[]).filter((x) => x.status === "granted").map((x) => String(x.permission)) : []);
  const mancano = PERMESSI_CHIAVE.filter((x) => !concesse.has(x));
  if (perm.ok && mancano.length) return { ok: false, code: `permessi_mancanti:${mancano.join(",")}` };
  return { ok: false, code: "nessuna_pagina" };
}

/** Autorizzazioni da spuntare quando si genera la chiave in Graph API Explorer. */
export const PERMESSI_CHIAVE = ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_manage_ads", "leads_retrieval", "business_management"];

/** Attiva l'arrivo dei lead di una pagina verso l'app del CRM (POST /{page}/subscribed_apps, campo leadgen). Solo su richiesta esplicita. */
export async function iscriviPagina(
  pageId: string,
  tokenPagina: string,
  cfg: Pick<MetaConfig, "appSecret" | "graphVersion" | "graphBaseUrl">,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; code?: string }> {
  if (!cfg.appSecret) return { ok: false, code: "config_missing" };
  if (!/^\d+$/.test(pageId)) return { ok: false, code: "invalid_page_id" };
  const q = new URLSearchParams({ subscribed_fields: "leadgen", appsecret_proof: appSecretProof(tokenPagina, cfg.appSecret) });
  try {
    const res = await fetchImpl(`${cfg.graphBaseUrl}/${cfg.graphVersion}/${pageId}/subscribed_apps?${q}`, { method: "POST", headers: { Authorization: `Bearer ${tokenPagina}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    const j = (await res.json().catch(() => null)) as { success?: boolean; error?: { code?: number } } | null;
    if (!res.ok || !j?.success) return { ok: false, code: j?.error?.code !== undefined ? `graph_${res.status}_c${j.error.code}` : `graph_${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, code: "graph_network" };
  }
}
