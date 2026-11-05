import { authorizeScheduler } from "../../src/lib/meta/schedulerAuth";
import { MAX_PAYLOAD_BYTES } from "../../src/lib/meta/parse";
import { handleNotification, handleVerification, pollLeads, replayLead, runSweep, type Deps } from "../../src/lib/meta/service";
import { chiaviPagineDa, fetchFormLeads, fetchIdentita, fetchPageForms, fetchPageSubscription, iscriviPagina } from "../../src/lib/meta/graph";
import { destinatarioOne, firmaValida, type CatalogoMeta } from "../../src/lib/meta/moduli";
import { moduliDaOne } from "./moduli-one";

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
    const poll = await pollLeads(deps).catch(() => undefined); // sola lettura; mai bloccante per lo sweep
    const out = await runSweep(deps, { limit: 25, budgetMs: 40_000 });
    // ogni 5 minuti: elenco dei moduli di Meta a P&C ONE (Impostazioni › Lead), che risponde con i moduli collegati
    const catalogo = deps.now().getUTCMinutes() % 5 === 0 ? await inviaCatalogo(deps, indirizzoGateway(req)).catch(() => false) : undefined;
    return j(200, { ok: true, ...out, poll, catalogo }); // solo contatori
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

// -------- Moduli istantanei: elenco letto da Meta e lead di un modulo, per P&C ONE (Impostazioni › Lead)
const indirizzoGateway = (req: Request) => (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : new URL(req.url).origin);

/** Pagine da leggere (variabili del gateway + quelle che conosce P&C ONE) con la chiave di ciascuna, se incollata in ONE. */
async function tuttePagine(deps: Deps): Promise<{ ids: string[]; token: Record<string, string> }> {
  const daOne = await moduliDaOne(deps.cfg, deps.fetchImpl).catch(() => null);
  return { ids: [...new Set([...deps.cfg.pageIds, ...(daOne?.pagine ?? [])])], token: daOne?.token ?? {} };
}
export async function leggiCatalogo(deps: Deps): Promise<CatalogoMeta> {
  const pagine = [];
  const { ids, token } = await tuttePagine(deps);
  for (const id of ids) {
    const p = await fetchPageForms(id, deps.cfg, deps.fetchImpl, token[id]);
    const isc = await fetchPageSubscription(id, deps.cfg, deps.fetchImpl, token[id]);
    pagine.push({ ...p, iscritta: isc.iscritta, nome: p.nome ?? isc.nome });
  }
  return { lettoIl: deps.now().toISOString(), pagine };
}
async function inviaCatalogo(deps: Deps, gateway: string): Promise<boolean> {
  const catalogo = await leggiCatalogo(deps);
  return (await moduliDaOne(deps.cfg, deps.fetchImpl, { catalogo, gateway_url: gateway }, 10_000)) !== null;
}

/** Richieste di P&C ONE, firmate con il segreto di ONE: «catalogo» (moduli delle pagine) o «lead» (ultimi lead di un modulo). */
export function one(make: Factory) {
  return async (req: Request) => {
    const deps = make();
    const dest = destinatarioOne(deps.cfg);
    const corpo = await req.text();
    if (!dest || !firmaValida([dest.secret], req.headers.get("x-gpc-timestamp"), req.headers.get("x-gpc-signature"), corpo)) return j(401, { ok: false });
    let b: { azione?: unknown; form_id?: unknown; giorni?: unknown; token?: unknown; page_id?: unknown };
    try { b = JSON.parse(corpo || "{}"); } catch { return j(400, { ok: false }); }
    if (b.azione === "pagine") {
      const pagine = [];
      const { ids, token } = await tuttePagine(deps);
      for (const id of ids) pagine.push({ ...(await fetchPageSubscription(id, deps.cfg, deps.fetchImpl, token[id])), nelleVariabili: deps.cfg.pageIds.includes(id), chiaveDaOne: !!token[id] });
      return j(200, { ok: true, pagine, identita: await fetchIdentita(deps.cfg, deps.fetchImpl) });
    }
    // chiave incollata in ONE → chiavi (senza scadenza) delle pagine; la chiave incollata non si conserva
    if (b.azione === "chiave") {
      const r = await chiaviPagineDa(String((b as { token?: unknown }).token ?? ""), deps.cfg, deps.fetchImpl);
      return r.ok ? j(200, { ok: true, pagine: r.pagine, lunga: r.lunga }) : j(400, { ok: false, error: r.code });
    }
    // attiva l'arrivo dei lead di una pagina (solo su richiesta esplicita da Impostazioni › Lead)
    if (b.azione === "iscrivi") {
      const pageId = String((b as { page_id?: unknown }).page_id ?? "");
      const { token } = await tuttePagine(deps);
      const tok = token[pageId];
      if (!tok) return j(400, { ok: false, error: "chiave_pagina_mancante" });
      const r = await iscriviPagina(pageId, tok, deps.cfg, deps.fetchImpl);
      return r.ok ? j(200, { ok: true }) : j(502, { ok: false, error: r.code });
    }
    if (b.azione === "catalogo") return j(200, { ok: true, catalogo: await leggiCatalogo(deps), gateway_url: indirizzoGateway(req) });
    if (b.azione === "lead") {
      const formId = String(b.form_id ?? "");
      if (!/^\d+$/.test(formId)) return j(400, { ok: false, error: "form_id" });
      const giorni = Math.min(90, Math.max(1, Number(b.giorni) || 7));
      const sinceSec = Math.floor(deps.now().getTime() / 1000) - giorni * 86400;
      const leads = [];
      let after: string | null = null;
      const pageId = String((b as { page_id?: unknown }).page_id ?? "");
      const tok = /^\d+$/.test(pageId) ? (await tuttePagine(deps)).token[pageId] : undefined;
      const cfgLettura = tok ? { ...deps.cfg, accessToken: tok } : deps.cfg;
      for (let i = 0; i < 5; i++) { // al massimo 500 lead per richiesta
        const r = await fetchFormLeads(formId, cfgLettura, deps.fetchImpl, { sinceSec, after });
        if (!r.ok) return j(502, { ok: false, error: r.code, leads });
        leads.push(...r.leads);
        if (!r.after) break;
        after = r.after;
      }
      return j(200, { ok: true, leads });
    }
    return j(400, { ok: false, error: "azione" });
  };
}
