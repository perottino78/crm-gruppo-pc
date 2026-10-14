import { test } from "node:test";
import assert from "node:assert/strict";
import { handleNotification, handleVerification, processDelivery, runSweep, handleInternalEvent, backoffMs, MAX_ATTEMPTS } from "../../src/lib/meta/service";
import { MAX_PAYLOAD_BYTES } from "../../src/lib/meta/parse";
import { appSecretProof, verifyInternal } from "../../src/lib/meta/signature";
import { T, cfg, graphLead, internalHeaders, json, makeDeps, notification, rawOf, signed } from "./helpers";

// ============================================================ 1. GET handshake
test("GET: handshake corretto restituisce il challenge come testo 200", () => {
  const r = handleVerification({ mode: "subscribe", token: T.verify, challenge: "1158201444" }, cfg());
  assert.deepEqual(r, { status: 200, body: "1158201444" });
});
test("GET: token errato, mode errato, token mancante, challenge mancante", () => {
  assert.equal(handleVerification({ mode: "subscribe", token: "sbagliato", challenge: "1" }, cfg()).status, 403);
  assert.equal(handleVerification({ mode: "unsubscribe", token: T.verify, challenge: "1" }, cfg()).status, 403);
  assert.equal(handleVerification({ mode: "subscribe", token: null, challenge: "1" }, cfg()).status, 403);
  assert.equal(handleVerification({ mode: "subscribe", token: T.verify, challenge: null }, cfg()).status, 400);
});
test("GET: senza META_WEBHOOK_VERIFY_TOKEN configurato risponde 503", () => {
  assert.equal(handleVerification({ mode: "subscribe", token: "x", challenge: "1" }, cfg({ META_WEBHOOK_VERIFY_TOKEN: "" })).status, 503);
});

// ============================================================ 2. POST: firma
test("POST: firma valida → 200, evento persistito, nessun lead ancora (risposta rapida)", async () => {
  const { deps, store } = makeDeps();
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  assert.equal(r.status, 200);
  assert.equal(r.body.received, 1);
  assert.equal(r.toProcess.length, 1);
  assert.equal(store.deliveries.size, 1);
  assert.equal([...store.deliveries.values()][0].stato, "RECEIVED");
});
test("POST: firma mancante, alterata, formato errato, segreto sbagliato → 401 e nulla persistito", async () => {
  const { deps, store } = makeDeps();
  const raw = rawOf(notification());
  const good = signed(raw);
  const tampered = Buffer.from(raw.toString().replace("555000111222333", "555000111222334"));
  for (const sig of [null, "", "sha256=abc", good.replace("sha256=", "sha1="), signed(raw, "altro_segreto"), good.slice(0, -1) + (good.endsWith("0") ? "1" : "0")]) {
    assert.equal((await handleNotification({ raw, signature: sig }, deps)).status, 401, String(sig));
  }
  assert.equal((await handleNotification({ raw: tampered, signature: good }, deps)).status, 401);
  assert.equal(store.deliveries.size, 0);
});
test("POST: la firma è verificata sul corpo grezzo (stessi byte, JSON riformattato = firma non valida)", async () => {
  const { deps } = makeDeps();
  const raw = rawOf(notification());
  const reformatted = Buffer.from(JSON.stringify(notification(), null, 2));
  assert.equal((await handleNotification({ raw: reformatted, signature: signed(raw) }, deps)).status, 401);
});

// ============================================================ 3. payload non valido / troppo grande
test("POST: payload non JSON, object diverso da page, forma errata → 400 (se firmati)", async () => {
  const { deps } = makeDeps();
  for (const raw of [Buffer.from("non json"), rawOf(notification({ object: "user" })), rawOf({ object: "page", entry: "x" }), rawOf([1, 2])]) {
    assert.equal((await handleNotification({ raw, signature: signed(raw) }, deps)).status, 400);
  }
});
test("POST: payload oltre il limite → 413 (dimensione reale e Content-Length dichiarato)", async () => {
  const { deps } = makeDeps();
  const big = Buffer.alloc(MAX_PAYLOAD_BYTES + 1, 97);
  assert.equal((await handleNotification({ raw: big, signature: signed(big) }, deps)).status, 413);
  const raw = rawOf(notification());
  assert.equal((await handleNotification({ raw, signature: signed(raw), declaredLength: MAX_PAYLOAD_BYTES + 5 }, deps)).status, 413);
});
test("POST: senza configurazione (app secret/page/form) → 503", async () => {
  const { deps } = makeDeps({ config: cfg({ META_APP_SECRET: "" }) });
  const raw = rawOf(notification());
  assert.equal((await handleNotification({ raw, signature: signed(raw) }, deps)).status, 503);
});

// ============================================================ 4. allowlist
test("Page ID e Form ID non autorizzati vengono ignorati (200, niente persistenza)", async () => {
  const { deps, store } = makeDeps();
  for (const o of [{ pageId: "999" }, { formId: "111222333" }]) {
    const raw = rawOf(notification(o));
    const r = await handleNotification({ raw, signature: signed(raw) }, deps);
    assert.equal(r.status, 200);
    assert.equal(r.body.ignored, 1);
    assert.equal(r.toProcess.length, 0);
  }
  assert.equal(store.deliveries.size, 0);
});
test("Solo field=leadgen viene elaborato", async () => {
  const { deps, store } = makeDeps();
  const raw = rawOf(notification({ field: "feed" }));
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  assert.equal(r.status, 200);
  assert.equal(store.deliveries.size, 0);
});
test("Errore di persistenza → 500 così Meta ritenta", async () => {
  const { deps, store } = makeDeps();
  store.failPersist = true;
  const raw = rawOf(notification());
  assert.equal((await handleNotification({ raw, signature: signed(raw) }, deps)).status, 500);
});

// ============================================================ recupero lead (Graph)
const okGraph = () => json(200, graphLead());

test("Graph: Authorization Bearer + appsecret_proof, token mai nell'URL, versione v26.0, campi richiesti", async () => {
  const { deps, store, calls } = makeDeps({ fetchImpl: async () => okGraph() });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  await processDelivery(deps, r.toProcess[0]);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.match(url, /^https:\/\/graph\.facebook\.com\/v26\.0\/555000111222333\?/);
  assert.ok(url.includes(`appsecret_proof=${appSecretProof(T.token, T.appSecret)}`));
  for (const f of ["id", "created_time", "form_id", "ad_id", "field_data"]) assert.ok(url.includes(f));
  assert.ok(!url.includes(T.token), "il token non deve comparire nell'URL");
  assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${T.token}`);
  assert.equal([...store.deliveries.values()][0].stato, "PROCESSED");
});
test("Lead creato con nome, telefono, email normalizzati e brand di default", async () => {
  const { deps, sink } = makeDeps({ fetchImpl: async () => okGraph() });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  await processDelivery(deps, r.toProcess[0]);
  const l = sink.leads.get(T.leadgenId)!;
  assert.equal(l.nome, "Mario Rossi");
  assert.equal(l.telefono, "+393331112233");
  assert.equal(l.email, "mario@example.com");
  assert.equal(l.brand, "P&C");
  assert.match(l.note ?? "", /Catalogo autunno/);
  assert.match(l.note ?? "", /citta: Torino/);
});
test("Graph: lead_id o form_id diversi dalla notifica → fallimento NON ritentabile", async () => {
  for (const over of [{ id: "999" }, { form_id: "42" }]) {
    const { deps, store, sink } = makeDeps({ fetchImpl: async () => json(200, graphLead(over)) });
    const raw = rawOf(notification());
    const r = await handleNotification({ raw, signature: signed(raw) }, deps);
    await processDelivery(deps, r.toProcess[0]);
    const d = [...store.deliveries.values()][0];
    assert.equal(d.stato, "FAILED");
    assert.equal(d.retriabile, false);
    assert.match(d.erroreCodice ?? "", /mismatch/);
    assert.equal(sink.leads.size, 0);
  }
});
test("Graph: errore temporaneo (500) → FAILED ritentabile con backoff; il retry poi riesce", async () => {
  let n = 0;
  const { deps, store, sink, clock } = makeDeps({ fetchImpl: async () => (++n === 1 ? json(500, { error: { message: "boom", code: 2 } }) : okGraph()) });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  assert.equal(await processDelivery(deps, r.toProcess[0]), "failed");
  const d = [...store.deliveries.values()][0];
  assert.equal(d.stato, "FAILED");
  assert.equal(d.retriabile, true);
  assert.equal(d.tentativi, 1);
  assert.equal(d.erroreCodice, "graph_500_c2");
  assert.equal(d.nextRetryAt!.getTime(), clock.t + backoffMs(1));
  // non ancora scaduto → lo sweep non lo riprende
  assert.equal((await runSweep(deps)).deliveries, 0);
  clock.t += backoffMs(1) + 1;
  assert.equal((await runSweep(deps)).deliveries, 1);
  assert.equal(d.stato, "PROCESSED");
  assert.equal(d.tentativi, 2);
  assert.equal(sink.leads.size, 1);
});
test("Graph: errori permanenti (token non valido 190, 400) e rete → classificazione corretta", async () => {
  const cases: [() => Promise<Response>, boolean, RegExp][] = [
    [async () => json(400, { error: { code: 190 } }), false, /graph_400_c190/],
    [async () => json(403, { error: { code: 200 } }), false, /graph_403_c200/],
    [async () => json(429, {}), true, /graph_429/],
    [async () => json(400, { error: { code: 4 } }), true, /c4/],
    [async () => { throw new Error("ECONNRESET"); }, true, /graph_network/],
  ];
  for (const [f, retriable, re] of cases) {
    const { deps, store } = makeDeps({ fetchImpl: f });
    const raw = rawOf(notification());
    const r = await handleNotification({ raw, signature: signed(raw) }, deps);
    await processDelivery(deps, r.toProcess[0]);
    const d = [...store.deliveries.values()][0];
    assert.equal(d.retriabile, retriable, String(re));
    assert.match(d.erroreCodice ?? "", re);
  }
});
test("Dopo MAX_ATTEMPTS tentativi un errore temporaneo diventa non ritentabile", async () => {
  const { deps, store } = makeDeps({ fetchImpl: async () => json(503, {}) });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await processDelivery(deps, r.toProcess[0]);
    [...store.deliveries.values()][0].nextRetryAt = new Date(0);
  }
  const d = [...store.deliveries.values()][0];
  assert.equal(d.tentativi, MAX_ATTEMPTS);
  assert.equal(d.retriabile, false);
});

// ============================================================ 5. idempotenza
test("Lead duplicato: stesso webhook due volte e doppia elaborazione → un solo delivery e un solo lead", async () => {
  const { deps, store, sink, calls } = makeDeps({ fetchImpl: async () => okGraph() });
  const raw = rawOf(notification());
  const a = await handleNotification({ raw, signature: signed(raw) }, deps);
  const b = await handleNotification({ raw, signature: signed(raw) }, deps);
  assert.equal(store.deliveries.size, 1);
  assert.equal(b.body.duplicates, 1);
  await Promise.all([processDelivery(deps, a.toProcess[0]), processDelivery(deps, b.toProcess[0])]);
  assert.equal(sink.leads.size, 1);
  assert.equal(calls.length, 1, "una sola chiamata Graph: la seconda elaborazione non reclama il lavoro");
  // retry di Meta dopo l'elaborazione: nessuna nuova elaborazione
  const c = await handleNotification({ raw, signature: signed(raw) }, deps);
  assert.equal(c.toProcess.length, 0);
});
test("Lo stesso evento ripetuto nello stesso payload viene deduplicato", async () => {
  const { deps, store } = makeDeps();
  const n = notification();
  n.entry.push(JSON.parse(JSON.stringify(n.entry[0])));
  const raw = rawOf(n);
  await handleNotification({ raw, signature: signed(raw) }, deps);
  assert.equal(store.deliveries.size, 1);
});

// ============================================================ 6. fan-out
const fanout = () =>
  cfg({
    META_DOWNSTREAMS: "crm-a,crm-b",
    META_DOWNSTREAM_CRM_A_URL: "https://crm-a.example.test/hook",
    META_DOWNSTREAM_CRM_A_SECRET: T.crmASecret,
    META_DOWNSTREAM_CRM_B_URL: "https://crm-b.example.test/hook",
    META_DOWNSTREAM_CRM_B_SECRET: T.crmBSecret,
  });

test("Fan-out: ogni CRM riceve l'evento firmato con il PROPRIO segreto; App Secret e token mai inoltrati", async () => {
  const { deps, calls } = makeDeps({
    config: fanout(),
    fetchImpl: async (url) => (url.startsWith("https://graph.facebook.com") ? okGraph() : json(200, { ok: true })),
  });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  await processDelivery(deps, r.toProcess[0]);
  const hooks = calls.filter((c) => c.url.includes("example.test"));
  assert.equal(hooks.length, 2);
  for (const [host, secret, other] of [["crm-a", T.crmASecret, T.crmBSecret], ["crm-b", T.crmBSecret, T.crmASecret]] as const) {
    const c = hooks.find((h) => h.url.includes(host))!;
    const h = c.init.headers as Record<string, string>;
    const body = String(c.init.body);
    assert.ok(verifyInternal(secret, h["x-gpc-timestamp"], h["x-gpc-signature"], body, Math.floor(deps.now().getTime() / 1000)), "firma valida col segreto del destinatario");
    assert.ok(!verifyInternal(other, h["x-gpc-timestamp"], h["x-gpc-signature"], body, Math.floor(deps.now().getTime() / 1000)), "firma non valida con il segreto dell'altro CRM");
    assert.equal(h["x-gpc-event-id"], T.leadgenId);
    const p = JSON.parse(body);
    assert.equal(p.event_id, T.leadgenId);
    assert.ok(!body.includes(T.appSecret) && !body.includes(T.token) && !body.includes(T.verify));
  }
});
test("Fan-out: un CRM non disponibile non impedisce la consegna all'altro; retry solo per quello fallito", async () => {
  let aUp = false;
  const { deps, store, calls, clock } = makeDeps({
    config: fanout(),
    fetchImpl: async (url) => {
      if (url.startsWith("https://graph.facebook.com")) return okGraph();
      if (url.includes("crm-a")) return aUp ? json(200, {}) : json(503, {});
      return json(200, {});
    },
  });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  await processDelivery(deps, r.toProcess[0]);
  const rows = () => [...store.downstreams.values()];
  assert.equal(rows().find((x) => x.destinatario === "crm-b")!.stato, "DELIVERED");
  const a = rows().find((x) => x.destinatario === "crm-a")!;
  assert.equal(a.stato, "FAILED");
  assert.equal(a.retriabile, true);
  assert.equal(a.erroreCodice, "downstream_503");
  // sweep prima della scadenza: nessun reinvio
  const before = calls.length;
  await runSweep(deps);
  assert.equal(calls.length, before);
  // CRM A torna su, retry scaduto: solo A viene reinviato, B (già consegnato) no → idempotenza per destinatario
  aUp = true;
  a.nextRetryAt = new Date(clock.t - 1000);
  await runSweep(deps);
  const hooks = calls.filter((c) => c.url.includes("example.test"));
  assert.equal(hooks.filter((c) => c.url.includes("crm-b")).length, 1, "B non riceve mai il duplicato");
  assert.equal(hooks.filter((c) => c.url.includes("crm-a")).length, 2);
  assert.equal(a.stato, "DELIVERED");
  // ulteriori sweep non reinviano nulla
  const n = calls.length;
  await runSweep(deps);
  assert.equal(calls.length, n);
});
test("Fan-out: 4xx permanente non viene ritentato; 409 è considerato consegnato (idempotenza lato ricevente)", async () => {
  const { deps, store } = makeDeps({
    config: fanout(),
    fetchImpl: async (url) => (url.startsWith("https://graph.facebook.com") ? okGraph() : url.includes("crm-a") ? json(401, {}) : json(409, {})),
  });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  await processDelivery(deps, r.toProcess[0]);
  const a = [...store.downstreams.values()].find((x) => x.destinatario === "crm-a")!;
  const b = [...store.downstreams.values()].find((x) => x.destinatario === "crm-b")!;
  assert.equal(a.stato, "FAILED");
  assert.equal(a.retriabile, false);
  assert.equal(b.stato, "DELIVERED");
});
test("Gateway puro (META_LOCAL_INGEST=false): nessun lead locale ma fan-out regolare", async () => {
  const { deps, sink, calls } = makeDeps({
    config: { ...fanout(), localIngest: false },
    fetchImpl: async (url) => (url.startsWith("https://graph.facebook.com") ? okGraph() : json(200, {})),
  });
  const raw = rawOf(notification());
  const r = await handleNotification({ raw, signature: signed(raw) }, deps);
  await processDelivery(deps, r.toProcess[0]);
  assert.equal(sink.leads.size, 0);
  assert.equal(calls.filter((c) => c.url.includes("example.test")).length, 2);
});

// ============================================================ ricezione evento interno (questo CRM come downstream)
test("Evento interno: firma valida → lead creato; duplicato → idempotente; firma/timestamp errati → 401", async () => {
  const { deps, sink } = makeDeps();
  const tsNow = String(Math.floor(deps.now().getTime() / 1000));
  const body = JSON.stringify({ event_id: T.leadgenId, leadgen_id: T.leadgenId, page_id: T.pageId, form_id: T.formId, ad_id: "1", lead: graphLead() });
  const raw = Buffer.from(body);
  const h = internalHeaders(T.internal, body, tsNow);
  const ok = await handleInternalEvent({ raw, timestamp: h.ts, signature: h.sig }, deps);
  assert.deepEqual([ok.status, ok.body.duplicate], [200, false]);
  const dup = await handleInternalEvent({ raw, timestamp: h.ts, signature: h.sig }, deps);
  assert.deepEqual([dup.status, dup.body.duplicate], [200, true]);
  assert.equal(sink.leads.size, 1);
  assert.equal((await handleInternalEvent({ raw, timestamp: h.ts, signature: "v1=" + "0".repeat(64) }, deps)).status, 401);
  const old = internalHeaders(T.internal, body, String(Number(tsNow) - 3600));
  assert.equal((await handleInternalEvent({ raw, timestamp: old.ts, signature: old.sig }, deps)).status, 401);
  const wrong = internalHeaders("altro", body, tsNow);
  assert.equal((await handleInternalEvent({ raw, timestamp: wrong.ts, signature: wrong.sig }, deps)).status, 401);
});
test("Evento interno: page/form non autorizzati ignorati", async () => {
  const { deps, sink } = makeDeps();
  const body = JSON.stringify({ leadgen_id: T.leadgenId, page_id: "1", form_id: T.formId, lead: graphLead() });
  const h = internalHeaders(T.internal, body, String(Math.floor(deps.now().getTime() / 1000)));
  const r = await handleInternalEvent({ raw: Buffer.from(body), timestamp: h.ts, signature: h.sig }, deps);
  assert.equal(r.body.ignored, true);
  assert.equal(sink.leads.size, 0);
});

// ============================================================ 7. privacy nei log
test("Nei log non compaiono token, App Secret, verify token, firme né dati personali", async () => {
  const { deps, logs } = makeDeps({ config: fanout(), fetchImpl: async (url) => (url.startsWith("https://graph.facebook.com") ? okGraph() : json(500, {})) });
  const raw = rawOf(notification());
  const sig = signed(raw);
  handleVerification({ mode: "subscribe", token: "tentativo_sbagliato", challenge: "1" }, deps.cfg);
  await handleNotification({ raw, signature: "sha256=" + "f".repeat(64) }, deps);
  const r = await handleNotification({ raw, signature: sig }, deps);
  await processDelivery(deps, r.toProcess[0]);
  const all = logs.join("\n");
  for (const secret of [T.appSecret, T.token, T.verify, T.crmASecret, T.crmBSecret, sig, "tentativo_sbagliato", "Mario", "393331112233", "example.com"]) {
    assert.ok(!all.includes(secret), `il log contiene un dato sensibile: ${secret.slice(0, 8)}…`);
  }
  assert.ok(all.length > 0);
});
