import { test } from "node:test";
import assert from "node:assert/strict";
import { pollLeads, runSweep, handleNotification } from "../../src/lib/meta/service";
import { T, cfg, graphLead, json, makeDeps, notification, rawOf, signed } from "./helpers";

const pollCfg = (extra: Record<string, string> = {}) =>
  cfg({
    META_LOCAL_INGEST: "false",
    META_POLL_ENABLED: "true",
    META_DOWNSTREAMS: "crm-attuale",
    META_DOWNSTREAM_CRM_ATTUALE_URL: "https://attuale.example.test/hook",
    META_DOWNSTREAM_CRM_ATTUALE_SECRET: T.crmASecret,
    ...extra,
  });
const L = (id: string, iso = "2026-10-14T09:30:00+0000") => graphLead({ id, created_time: iso });

test("Polling disattivato di default: nessuna chiamata a Graph", async () => {
  const { deps, calls } = makeDeps({ config: cfg(), fetchImpl: async () => json(200, { data: [] }) });
  const r = await pollLeads(deps);
  assert.equal(calls.length, 0);
  assert.equal(r.added, 0);
});

test("Polling: solo GET su /{form}/leads, Bearer, appsecret_proof, token mai nell'URL, nessuna scrittura", async () => {
  const { deps, calls } = makeDeps({ config: pollCfg(), fetchImpl: async () => json(200, { data: [L("1001")] }) });
  await pollLeads(deps);
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal((c.init.method ?? "GET"), "GET");
  assert.ok(c.url.startsWith(`https://graph.facebook.com/v26.0/${T.formId}/leads?`));
  assert.ok(c.url.includes("appsecret_proof="));
  assert.ok(!c.url.includes(T.token), "token mai nell'URL");
  assert.equal((c.init.headers as Record<string, string>).Authorization, `Bearer ${T.token}`);
});

test("Polling: accoda lead nuovi con origine POLL, lead già in mano (nessuna seconda chiamata Graph) e dedup", async () => {
  const { deps, store, calls } = makeDeps({ config: pollCfg(), fetchImpl: async () => json(200, { data: [L("1001"), L("1002")] }) });
  const a = await pollLeads(deps);
  assert.deepEqual([a.added, a.duplicates], [2, 0]);
  const b = await pollLeads(deps);
  assert.deepEqual([b.added, b.duplicates], [0, 2], "secondo giro: nessun doppione");
  assert.equal(store.deliveries.size, 2);
  for (const d of store.deliveries.values()) {
    assert.equal(d.origine, "POLL");
    assert.ok(d.leadJson, "lead salvato");
    assert.ok(!d.eventJson.includes("Mario"), "eventJson senza dati personali");
  }
  assert.equal(calls.length, 2);
});

test("Dedup tra canali: lead già arrivato dal webhook non viene riaccodato dal polling", async () => {
  const { deps, store } = makeDeps({ config: pollCfg(), fetchImpl: async (u) => (u.includes("/leads?") ? json(200, { data: [L(T.leadgenId)] }) : json(200, graphLead())) });
  const raw = rawOf(notification());
  await handleNotification({ raw, signature: signed(raw) }, deps);
  const r = await pollLeads(deps);
  assert.deepEqual([r.added, r.duplicates], [0, 1]);
  assert.equal(store.deliveries.size, 1);
  assert.equal([...store.deliveries.values()][0].origine, "META");
});

test("Shadow forzato: i lead POLL arrivano ai CRM sempre in shadow, anche con destinatario live", async () => {
  const { deps, calls, clock } = makeDeps({ config: pollCfg({ META_DOWNSTREAM_CRM_ATTUALE_MODE: "live" }), fetchImpl: async (u) => (u.includes("example.test") ? json(200, { ok: true }) : json(200, { data: [L("1001")] })) });
  await pollLeads(deps);
  clock.t += 60_000;
  await runSweep(deps);
  const hook = calls.find((c) => c.url.includes("example.test"))!;
  assert.equal((hook.init.headers as Record<string, string>)["x-gpc-mode"], "shadow");
  assert.equal(JSON.parse(String(hook.init.body)).mode, "shadow");
  assert.equal(calls.filter((c) => c.url.includes("graph.facebook.com") && !c.url.includes("/leads?")).length, 0, "nessuna rilettura singola: il lead era già salvato");
});

test("META_POLL_LIVE=true è l'unico modo per inoltrare i lead POLL in live", async () => {
  const { deps, calls, clock } = makeDeps({ config: pollCfg({ META_DOWNSTREAM_CRM_ATTUALE_MODE: "live", META_POLL_LIVE: "true" }), fetchImpl: async (u) => (u.includes("example.test") ? json(200, {}) : json(200, { data: [L("1001")] })) });
  await pollLeads(deps);
  clock.t += 60_000;
  await runSweep(deps);
  const hook = calls.find((c) => c.url.includes("example.test"))!;
  assert.equal((hook.init.headers as Record<string, string>)["x-gpc-mode"], "live");
});

test("Finestra temporale: lead più vecchi di META_POLL_SINCE ignorati (difesa lato client)", async () => {
  const { deps, store } = makeDeps({
    config: pollCfg({ META_POLL_SINCE: "2026-10-14T00:00:00Z" }),
    fetchImpl: async () => json(200, { data: [L("1001", "2026-10-13T10:00:00+0000"), L("1002", "2026-10-14T08:00:00+0000")] }),
  });
  const r = await pollLeads(deps);
  assert.equal(r.added, 1);
  assert.deepEqual([...store.deliveries.values()].map((d) => d.leadgenId), ["1002"]);
});

test("Paginazione: usa solo il cursore, non segue mai l'URL next (contiene il token)", async () => {
  let n = 0;
  const { deps, calls, store } = makeDeps({
    config: pollCfg(),
    fetchImpl: async () =>
      ++n === 1
        ? json(200, { data: [L("1001")], paging: { cursors: { after: "CUR1" }, next: `https://graph.facebook.com/x?access_token=${T.token}` } })
        : json(200, { data: [L("1002")], paging: { cursors: { after: "CUR2" } } }),
  });
  const r = await pollLeads(deps);
  assert.equal(r.added, 2);
  assert.equal(store.deliveries.size, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.includes("after=CUR1"));
  assert.ok(calls.every((c) => !c.url.includes("access_token")));
});

test("Lead di altri moduli o con ID anomali scartati; modulo non autorizzato mai interrogato", async () => {
  const { deps, store, calls } = makeDeps({
    config: pollCfg(),
    fetchImpl: async () => json(200, { data: [L("1001"), graphLead({ id: "1002", form_id: "999" }), graphLead({ id: "abc; drop" })] }),
  });
  const r = await pollLeads(deps);
  assert.equal(r.added, 1);
  assert.equal(store.deliveries.size, 1);
  assert.ok(calls.every((c) => c.url.includes(`/${T.formId}/leads`)));
});

test("Errori Graph (token scaduto, rete): contati, nessun crash, nessun dato nei log", async () => {
  const { deps, logs, store } = makeDeps({ config: pollCfg(), fetchImpl: async () => json(401, { error: { code: 190, message: "Token SEGRETO scaduto" } }) });
  const r = await pollLeads(deps);
  assert.equal(r.errors, 1);
  assert.equal(store.deliveries.size, 0);
  assert.ok(logs.some((l) => l.includes("poll_failed")));
  assert.ok(!logs.join("").includes("SEGRETO") && !logs.join("").includes(T.token));
  const net = makeDeps({ config: pollCfg(), fetchImpl: async () => { throw new Error("rete giù"); } });
  assert.equal((await pollLeads(net.deps)).errors, 1);
});

test("Un CRM giù non blocca l'altro e il polling non duplica al giro successivo", async () => {
  const c = pollCfg({
    META_DOWNSTREAMS: "crm-attuale,crm-gruppo-pc",
    META_DOWNSTREAM_CRM_GRUPPO_PC_URL: "https://gpc.example.test/in",
    META_DOWNSTREAM_CRM_GRUPPO_PC_SECRET: T.crmBSecret,
  });
  const { deps, store, clock } = makeDeps({ config: c, fetchImpl: async (u) => (u.includes("attuale") ? json(503, {}) : u.includes("gpc.example") ? json(200, {}) : json(200, { data: [L("1001")] })) });
  await pollLeads(deps);
  clock.t += 60_000;
  await runSweep(deps);
  await pollLeads(deps);
  const st = Object.fromEntries([...store.downstreams.values()].map((x) => [x.destinatario, x.stato]));
  assert.equal(st["crm-gruppo-pc"], "DELIVERED");
  assert.equal(st["crm-attuale"], "FAILED");
  assert.equal(store.deliveries.size, 1);
});
