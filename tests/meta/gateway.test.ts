import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { buildDownstreamPayload, handleInternalEvent, handleNotification, processDelivery, replayLead, runSweep, STALE_PROCESSING_MS } from "../../src/lib/meta/service";
import { authorizeScheduler } from "../../src/lib/meta/schedulerAuth";
import { verifyInternal } from "../../src/lib/meta/signature";
import { T, cfg, graphLead, internalHeaders, json, makeDeps, notification, rawOf, signed } from "./helpers";

const shadowCfg = () =>
  cfg({
    META_LOCAL_INGEST: "false",
    META_DOWNSTREAMS: "crm-attuale,crm-gruppo-pc",
    META_DOWNSTREAM_CRM_ATTUALE_URL: "https://attuale.example.test/hook",
    META_DOWNSTREAM_CRM_ATTUALE_SECRET: T.crmASecret,
    META_DOWNSTREAM_CRM_GRUPPO_PC_URL: "https://gpc.example.test/api/lead/meta/internal",
    META_DOWNSTREAM_CRM_GRUPPO_PC_SECRET: T.crmBSecret,
  });
const graphOrOk = (url: string) => (url.startsWith("https://graph.facebook.com") ? json(200, graphLead()) : json(200, {}));

// ============================================================ contratto downstream
test("Contratto v1: intestazioni e payload esatti, nessun segreto Meta, corpo identico tra i tentativi", async () => {
  const { deps, calls, store } = makeDeps({ config: shadowCfg(), fetchImpl: async (u) => (u.startsWith("https://graph.facebook.com") ? json(200, graphLead()) : json(503, {})) });
  const raw = rawOf(notification());
  const sig = signed(raw);
  const r = await handleNotification({ raw, signature: sig }, deps);
  await processDelivery(deps, r.toProcess[0]);
  const hook = calls.filter((c) => c.url.includes("example.test"))[0];
  const h = hook.init.headers as Record<string, string>;
  assert.deepEqual(Object.keys(h).sort(), ["content-type", "user-agent", "x-gpc-attempt", "x-gpc-event-id", "x-gpc-mode", "x-gpc-schema-version", "x-gpc-signature", "x-gpc-timestamp"]);
  assert.equal(h["x-gpc-schema-version"], "1");
  assert.equal(h["x-gpc-mode"], "shadow", "default sicuro: shadow");
  assert.match(h["x-gpc-signature"], /^v1=[0-9a-f]{64}$/);
  const p = JSON.parse(String(hook.init.body));
  assert.deepEqual(Object.keys(p), ["schema_version", "event_id", "source", "mode", "leadgen_id", "page_id", "form_id", "ad_id", "adgroup_id", "created_time", "received_at", "lead"]);
  assert.deepEqual(Object.keys(p.lead), ["id", "created_time", "form_id", "ad_id", "campaign_name", "field_data"]);
  assert.equal(p.mode, "shadow");
  const all = String(hook.init.body) + JSON.stringify(h);
  assert.ok(!all.includes(T.appSecret) && !all.includes(sig) && !all.includes(T.token), "niente App Secret, token o firma Meta originale");
  // corpo identico a ogni tentativo; timestamp e firma cambiano
  const d = [...store.deliveries.values()][0];
  assert.equal(buildDownstreamPayload({ ...d }, "shadow"), String(hook.init.body));
});
test("Anti-replay: finestra ±300 s sul timestamp firmato; replay entro la finestra neutralizzato dall'idempotenza", async () => {
  const body = "{}";
  const now = 1_760_000_000;
  const mk = (ts: number) => internalHeaders(T.internal, body, String(ts));
  for (const [delta, ok] of [[0, true], [299, true], [-299, true], [301, false], [-301, false], [3600, false]] as const) {
    const h = mk(now + delta);
    assert.equal(verifyInternal(T.internal, h.ts, h.sig, body, now), ok, `delta ${delta}`);
  }
  assert.equal(verifyInternal(T.internal, "abc", "v1=" + "0".repeat(64), body, now), false);
});

// ============================================================ shadow mode
test("Shadow: default shadow per tutti i destinatari; il gateway non crea lead locali", async () => {
  const { deps, sink, calls } = makeDeps({ config: shadowCfg(), fetchImpl: async (u) => graphOrOk(u) });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  await processDelivery(deps, r.toProcess[0]);
  assert.equal(sink.leads.size, 0);
  const modes = calls.filter((c) => c.url.includes("example.test")).map((c) => (c.init.headers as Record<string, string>)["x-gpc-mode"]);
  assert.deepEqual(modes, ["shadow", "shadow"]);
});
test("Shadow: un destinatario può essere live mentre l'altro resta shadow", async () => {
  const c = cfg({ ...{}, META_LOCAL_INGEST: "false", META_DOWNSTREAMS: "a,b", META_DOWNSTREAM_A_URL: "https://a.example.test/h", META_DOWNSTREAM_A_SECRET: T.crmASecret, META_DOWNSTREAM_A_MODE: "live", META_DOWNSTREAM_B_URL: "https://b.example.test/h", META_DOWNSTREAM_B_SECRET: T.crmBSecret });
  const { deps, calls } = makeDeps({ config: c, fetchImpl: async (u) => graphOrOk(u) });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  await processDelivery(deps, r.toProcess[0]);
  const m = Object.fromEntries(calls.filter((x) => x.url.includes("example.test")).map((x) => [x.url.includes("//a.") ? "a" : "b", (x.init.headers as Record<string, string>)["x-gpc-mode"]]));
  assert.deepEqual(m, { a: "live", b: "shadow" });
});
test("CRM destinatario in shadow: registra l'evento ma NON crea lead né notifiche; il duplicato è idempotente", async () => {
  const { deps, sink, inbound } = makeDeps({ config: cfg({ META_INTERNAL_MODE: "shadow" }) });
  const body = JSON.stringify({ schema_version: 1, event_id: `meta_leadgen_${T.leadgenId}`, mode: "live", leadgen_id: T.leadgenId, page_id: T.pageId, form_id: T.formId, lead: graphLead() });
  const ts = String(Math.floor(deps.now().getTime() / 1000));
  const h = internalHeaders(T.internal, body, ts);
  const a = await handleInternalEvent({ raw: Buffer.from(body), timestamp: h.ts, signature: h.sig }, deps);
  assert.deepEqual([a.status, a.body.shadow], [202, true]);
  assert.equal(sink.leads.size, 0);
  assert.equal(inbound.events.size, 1);
  const b = await handleInternalEvent({ raw: Buffer.from(body), timestamp: h.ts, signature: h.sig }, deps);
  assert.deepEqual([b.status, b.body.duplicate], [200, true]);
});
test("CRM destinatario: payload shadow del gateway è sempre shadow anche se il CRM è live", async () => {
  const { deps, sink } = makeDeps();
  const body = JSON.stringify({ schema_version: 1, event_id: `meta_leadgen_${T.leadgenId}`, mode: "shadow", leadgen_id: T.leadgenId, page_id: T.pageId, form_id: T.formId, lead: graphLead() });
  const h = internalHeaders(T.internal, body, String(Math.floor(deps.now().getTime() / 1000)));
  const r = await handleInternalEvent({ raw: Buffer.from(body), timestamp: h.ts, signature: h.sig }, deps);
  assert.equal(r.status, 202);
  assert.equal(sink.leads.size, 0);
});
test("CRM destinatario live: crea il lead; errore temporaneo del sink → 503 e il retry completa senza doppioni", async () => {
  const { deps, sink } = makeDeps();
  const real = sink.ingest.bind(sink);
  let fail = true;
  sink.ingest = async (i) => (fail ? { ok: false, retriable: true, code: "db_error" } : real(i));
  const body = JSON.stringify({ schema_version: 1, event_id: `meta_leadgen_${T.leadgenId}`, mode: "live", leadgen_id: T.leadgenId, page_id: T.pageId, form_id: T.formId, lead: graphLead() });
  const h = internalHeaders(T.internal, body, String(Math.floor(deps.now().getTime() / 1000)));
  const send = () => handleInternalEvent({ raw: Buffer.from(body), timestamp: h.ts, signature: h.sig }, deps);
  assert.equal((await send()).status, 503);
  fail = false;
  assert.deepEqual([(await send()).status, sink.leads.size], [200, 1]);
  assert.equal((await send()).body.duplicate, true);
  assert.equal(sink.leads.size, 1);
});
test("Contratto: schema_version sconosciuta → 422, event_id incoerente → 400", async () => {
  const { deps } = makeDeps();
  const mk = (o: Record<string, unknown>) => {
    const body = JSON.stringify({ schema_version: 1, event_id: `meta_leadgen_${T.leadgenId}`, mode: "live", leadgen_id: T.leadgenId, page_id: T.pageId, form_id: T.formId, lead: graphLead(), ...o });
    const h = internalHeaders(T.internal, body, String(Math.floor(deps.now().getTime() / 1000)));
    return handleInternalEvent({ raw: Buffer.from(body), timestamp: h.ts, signature: h.sig }, deps);
  };
  assert.equal((await mk({ schema_version: 2 })).status, 422);
  assert.equal((await mk({ event_id: "altro" })).status, 400);
  assert.equal((await mk({ mode: "boh" })).status, 400);
});

// ============================================================ replay: sempre shadow, mai duplicati
test("Replay: lead reale riletto da Graph e distribuito SEMPRE in shadow, anche con destinatari live", async () => {
  const c = cfg({ META_LOCAL_INGEST: "false", META_DOWNSTREAMS: "a", META_DOWNSTREAM_A_URL: "https://a.example.test/h", META_DOWNSTREAM_A_SECRET: T.crmASecret, META_DOWNSTREAM_A_MODE: "live" });
  const { deps, calls, store } = makeDeps({ config: c, fetchImpl: async (u) => graphOrOk(u) });
  const r = await replayLead(deps, T.leadgenId);
  assert.equal(r.status, 200);
  assert.equal((calls.find((x) => x.url.includes("example.test"))!.init.headers as Record<string, string>)["x-gpc-mode"], "shadow");
  assert.equal([...store.deliveries.values()][0].origine, "REPLAY");
  // secondo replay o lead già ricevuto da Meta: nessun reinvio
  const hooks = () => calls.filter((x) => x.url.includes("example.test")).length;
  const n = hooks();
  assert.equal((await replayLead(deps, T.leadgenId)).body.duplicate, true);
  assert.equal(hooks(), n);
});
test("Replay: form non autorizzato → 403; id non valido → 400", async () => {
  const { deps } = makeDeps({ fetchImpl: async () => json(200, graphLead({ form_id: "42" })) });
  assert.equal((await replayLead(deps, T.leadgenId)).status, 403);
  assert.equal((await replayLead(deps, "x;y")).status, 400);
});

// ============================================================ nessuna dipendenza dalla funzione dopo il 200
test("Crash dopo il 200: l'handler non elabora nulla; lo scheduler completa tutto leggendo lo stato persistito", async () => {
  const { deps, store, calls, clock } = makeDeps({ config: shadowCfg(), fetchImpl: async (u) => graphOrOk(u) });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  assert.equal(r.status, 200);
  // La "funzione" muore qui: niente processDelivery, niente chiamate esterne eseguite dall'handler.
  assert.equal(calls.length, 0);
  assert.equal([...store.deliveries.values()][0].stato, "RECEIVED");
  // Un nuovo "processo" (sweep dello scheduler) riprende il lavoro dopo la tolleranza.
  clock.t += 3600_000;
  const out = await runSweep(deps);
  assert.equal(out.deliveries, 1);
  assert.equal([...store.deliveries.values()][0].stato, "PROCESSED");
  assert.equal(calls.filter((c) => c.url.includes("example.test")).length, 2);
});
test("Crash durante l'elaborazione (PROCESSING abbandonato): ripreso dopo la scadenza e completato", async () => {
  const { deps, store, clock } = makeDeps({ config: shadowCfg(), fetchImpl: async (u) => graphOrOk(u) });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  assert.ok(await store.claim(r.toProcess[0], new Date(0))); // un processo reclama e poi muore
  assert.equal((await runSweep(deps)).deliveries, 0, "ancora entro la lease: non viene ripreso");
  clock.t += STALE_PROCESSING_MS + 1000;
  assert.equal((await runSweep(deps)).deliveries, 1);
  assert.equal([...store.deliveries.values()][0].stato, "PROCESSED");
});
test("Crash dopo markProcessed prima del fan-out: le righe di consegna esistono già e vengono inviate dallo sweep", async () => {
  const { deps, store, calls } = makeDeps({ config: shadowCfg(), fetchImpl: async (u) => graphOrOk(u) });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  const orig = deps.fetchImpl;
  deps.fetchImpl = (async (u: string, i: RequestInit) => { if (String(u).includes("example.test")) throw new Error("processo ucciso"); return orig(u, i); }) as typeof fetch;
  await processDelivery(deps, r.toProcess[0]);
  deps.fetchImpl = orig;
  for (const x of store.downstreams.values()) { x.nextRetryAt = new Date(0); }
  await runSweep(deps);
  assert.equal([...store.downstreams.values()].every((x) => x.stato === "DELIVERED"), true);
  assert.equal(calls.filter((c) => c.url.includes("example.test")).length >= 2, true);
});

// ============================================================ indisponibilità indipendente + requeue
test("Un CRM giù per ore: l'altro resta consegnato; dopo il ripristino consegna con firma fresca (timestamp nuovo)", async () => {
  let attuale = false;
  const { deps, store, calls, clock } = makeDeps({
    config: shadowCfg(),
    fetchImpl: async (u) => (u.startsWith("https://graph.facebook.com") ? json(200, graphLead()) : u.includes("attuale") ? (attuale ? json(200, {}) : json(502, {})) : json(200, {})),
  });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  await processDelivery(deps, r.toProcess[0]);
  const row = (n: string) => [...store.downstreams.values()].find((x) => x.destinatario === n)!;
  assert.equal(row("crm-gruppo-pc").stato, "DELIVERED");
  assert.equal(row("crm-attuale").stato, "FAILED");
  clock.t += 3 * 3600_000;
  attuale = true;
  row("crm-attuale").nextRetryAt = new Date(clock.t - 1);
  await runSweep(deps);
  assert.equal(row("crm-attuale").stato, "DELIVERED");
  const tries = calls.filter((c) => c.url.includes("attuale"));
  const ts = tries.map((c) => (c.init.headers as Record<string, string>)["x-gpc-timestamp"]);
  assert.notEqual(ts[0], ts[ts.length - 1], "timestamp rinnovato a ogni tentativo (finestra anti-replay rispettata anche dopo ore)");
  assert.equal(calls.filter((c) => c.url.includes("gpc.example")).length, 1);
});
test("Retry-After del destinatario viene rispettato; errore permanente 4xx va in dead-letter e requeue lo riattiva", async () => {
  let code = 401;
  const { deps, store, clock } = makeDeps({ config: shadowCfg(), fetchImpl: async (u) => (u.startsWith("https://graph.facebook.com") ? json(200, graphLead()) : u.includes("attuale") ? json(code, {}) : json(200, {})) });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  await processDelivery(deps, r.toProcess[0]);
  const a = [...store.downstreams.values()].find((x) => x.destinatario === "crm-attuale")!;
  assert.deepEqual([a.stato, a.retriabile], ["FAILED", false]);
  assert.equal((await runSweep(deps)).downstreams, 0, "dead-letter: non ritentato");
  code = 200;
  assert.equal(await store.requeueDownstreams(new Date(clock.t), "crm-attuale"), 1);
  await runSweep(deps);
  assert.equal(a.stato, "DELIVERED");
});

// ============================================================ autenticazione scheduler
const b64u = (s: string | Buffer) => Buffer.from(s).toString("base64url");
function qstashJwt(key: string, o: { url: string; body: string; exp: number; nbf?: number; iss?: string }) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify({ iss: o.iss ?? "Upstash", sub: o.url, exp: o.exp, nbf: o.nbf ?? o.exp - 300, body: b64u(createHash("sha256").update(o.body).digest()) }));
  return `${h}.${p}.${b64u(createHmac("sha256", key).update(`${h}.${p}`).digest())}`;
}
test("Scheduler auth: Bearer corretto; errato, assente o segreto debole → rifiutato", () => {
  const secret = "s".repeat(40);
  const base = { url: "https://gw.test/api/internal/tick", rawBody: "", nowSec: 1_760_000_000 };
  const c = cfg({ META_SCHEDULER_SECRET: secret });
  assert.ok(authorizeScheduler({ ...base, authorization: `Bearer ${secret}` }, c));
  assert.ok(!authorizeScheduler({ ...base, authorization: "Bearer sbagliato" }, c));
  assert.ok(!authorizeScheduler({ ...base, authorization: null }, c));
  const weak = cfg({ META_SCHEDULER_SECRET: "corto" });
  assert.equal(weak.schedulerSecret, undefined, "segreti < 32 caratteri non sono accettati");
  assert.ok(!authorizeScheduler({ ...base, authorization: "Bearer corto" }, weak));
});
test("Scheduler auth: firma QStash valida; URL, corpo, scadenza, issuer o chiave errati → rifiutata", () => {
  const key = "qstash_test_key_not_real";
  const url = "https://gw.test/api/internal/tick";
  const now = 1_760_000_000;
  const c = cfg({ QSTASH_CURRENT_SIGNING_KEY: key });
  const ok = qstashJwt(key, { url, body: "", exp: now + 300 });
  const t = (sig: string, over: Partial<{ url: string; rawBody: string; nowSec: number }> = {}) => authorizeScheduler({ url, rawBody: "", nowSec: now, authorization: null, upstashSignature: sig, ...over }, c);
  assert.ok(t(ok));
  assert.ok(!t(ok, { url: "https://evil.test/x" }));
  assert.ok(!t(ok, { rawBody: "{}" }));
  assert.ok(!t(ok, { nowSec: now + 1000 }), "scaduta");
  assert.ok(!t(qstashJwt(key, { url, body: "", exp: now + 300, iss: "Altro" })));
  assert.ok(!t(qstashJwt("altra_chiave", { url, body: "", exp: now + 300 })));
  assert.ok(!t("a.b.c"));
});
