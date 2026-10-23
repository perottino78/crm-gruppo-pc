// Test su Postgres REALE + E2E su HTTP reale (gateway locale, Graph finto, due CRM finti).
// Richiede TEST_DATABASE_URL. Tutti i valori sono finti.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { execSync } from "node:child_process";
import { PrismaClient } from "../generated/client";
import { makePrismaMetaStore, type MetaPrisma } from "../../src/lib/meta/prismaStoreFactory";
import { loadMetaConfig } from "../../src/lib/meta/config";
import { metaSignature, verifyInternal } from "../../src/lib/meta/signature";
import { startGateway } from "../dev-server";
import type { Deps } from "../../src/lib/meta/service";
import type { LeadgenEvent } from "../../src/lib/meta/types";

const URL_DB = process.env.TEST_DATABASE_URL!;
const prisma = new PrismaClient({ datasourceUrl: URL_DB });
const store = makePrismaMetaStore(prisma as unknown as MetaPrisma);

const S = { app: "test_app_secret_not_real", tok: "TEST_TOKEN_not_real", ver: "test_verify_not_real", sched: "s".repeat(40), a: "A".repeat(40), b: "B".repeat(40) };
const PAGE = "1039357632750262", FORM = "1280816026986939";
const ev = (id: string): LeadgenEvent => ({ leadgenId: id, pageId: PAGE, formId: FORM, adId: "1" });

const clk = { t: Date.now() };
type Crm = { server: Server; url: string; down: boolean; got: { id: string; mode: string; sigOk: boolean; ts: string; sig: string; body: string }[] };
async function fakeCrm(secret: string): Promise<Crm> {
  const crm = { down: false, got: [] as Crm["got"] } as Crm;
  crm.server = createServer(async (req, res) => {
    const ch: Buffer[] = []; for await (const c of req) ch.push(c as Buffer);
    const body = Buffer.concat(ch).toString();
    if (crm.down) { res.statusCode = 503; res.end(); return; }
    const ts = String(req.headers["x-gpc-timestamp"]); const sig = String(req.headers["x-gpc-signature"]);
    const sigOk = verifyInternal(secret, ts, sig, body, Math.floor(clk.t / 1000));
    crm.got.push({ id: String(req.headers["x-gpc-event-id"]), mode: String(req.headers["x-gpc-mode"]), sigOk, ts, sig, body });
    res.statusCode = sigOk ? 200 : 401; res.end("{}");
  });
  await new Promise<void>((r) => crm.server.listen(0, "127.0.0.1", () => r()));
  crm.url = `http://127.0.0.1:${(crm.server.address() as { port: number }).port}/api/lead/meta/internal`;
  return crm;
}

before(async () => {
  execSync("npx prisma migrate deploy", { cwd: new URL("..", import.meta.url).pathname, env: { ...process.env, DATABASE_URL: URL_DB, DIRECT_DATABASE_URL: URL_DB }, stdio: "pipe" });
});
after(async () => { await prisma.$disconnect(); });

test("PG: upsertReceived concorrente → una sola riga, un solo isNew", async () => {
  const r = await Promise.all(Array.from({ length: 20 }, () => store.upsertReceived(ev("9001"), "{}", new Date())));
  assert.equal(r.filter((x) => x.isNew).length, 1);
  assert.equal(new Set(r.map((x) => x.id)).size, 1);
  assert.equal(await prisma.metaDelivery.count({ where: { leadgenId: "9001" } }), 1);
});

test("PG: claim concorrente → un solo vincitore; PROCESSING scaduto ripreso", async () => {
  const { id } = await store.upsertReceived(ev("9002"), "{}", new Date());
  const stale = new Date(Date.now() - 180_000);
  const r = await Promise.all(Array.from({ length: 15 }, () => store.claim(id, stale)));
  assert.equal(r.filter(Boolean).length, 1);
  assert.equal((await prisma.metaDelivery.findUniqueOrThrow({ where: { id } })).tentativi, 1);
  assert.equal(await store.claim(id, stale), null); // ancora fresco
  await prisma.metaDelivery.update({ where: { id }, data: { updatedAt: new Date(Date.now() - 10 * 60_000) } });
  assert.ok(await store.claim(id, new Date(Date.now() - 180_000))); // abbandonato → ripreso
});

test("PG: ensureDownstreams idempotente e concorrente; claimDownstream un solo vincitore", async () => {
  const { id } = await store.upsertReceived(ev("9003"), "{}", new Date());
  await Promise.all(Array.from({ length: 10 }, () => store.ensureDownstreams(id, ["crm-a", "crm-b"])));
  const ds = await store.getDownstreams(id);
  assert.equal(ds.length, 2);
  const w = await Promise.all(Array.from({ length: 12 }, () => store.claimDownstream(ds[0].id, new Date(), 120_000)));
  assert.equal(w.filter((x) => x !== null).length, 1);
});

test("PG: requeue e stats", async () => {
  const { id } = await store.upsertReceived(ev("9004"), "{}", new Date());
  await store.claim(id, new Date(0));
  await store.markFailed(id, "boom", false, null);
  assert.ok((await store.requeueDeliveries(new Date())) >= 1);
  const row = await prisma.metaDelivery.findUniqueOrThrow({ where: { id } });
  assert.equal(row.retriabile, true); assert.equal(row.tentativi, 0);
  const st = await store.stats();
  assert.ok(Object.keys(st.deliveries).length > 0);
});

// ------------------------------------------------------------------ E2E
test("E2E: webhook firmato → 200 dopo persistenza; CRM-B spento non blocca CRM-A; ritenta e recupera; nessun duplicato", async () => {
  await prisma.metaDownstream.deleteMany(); await prisma.metaDelivery.deleteMany();
  const crmA = await fakeCrm(S.a), crmB = await fakeCrm(S.b);
  crmB.down = true;
  let graphCalls = 0;
  const graph = createServer((req, res) => {
    graphCalls++;
    assert.ok(!String(req.url).includes(S.tok)); // token mai nell'URL
    assert.equal(req.headers.authorization, `Bearer ${S.tok}`);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: String(req.url).split("/")[2].split("?")[0], created_time: "2026-10-14T10:00:00+0000", form_id: FORM, field_data: [{ name: "full_name", values: ["Mario Rossi"] }, { name: "phone_number", values: ["+393331112233"] }] }));
  });
  await new Promise<void>((r) => graph.listen(0, "127.0.0.1", () => r()));
  const clock = clk;
  const env = {
    NODE_ENV: "test", META_APP_ID: "1842181417134760", META_APP_SECRET: S.app, META_ACCESS_TOKEN: S.tok, META_WEBHOOK_VERIFY_TOKEN: S.ver,
    META_PAGE_ID: PAGE, META_GRAPH_API_VERSION: "v26.0", META_ALLOWED_FORM_IDS: FORM, META_SCHEDULER_SECRET: S.sched,
    META_GRAPH_BASE_URL: `http://127.0.0.1:${(graph.address() as { port: number }).port}`, META_LOCAL_INGEST: "false",
    META_DOWNSTREAMS: "crm-a,crm-b",
    META_DOWNSTREAM_CRM_A_URL: crmA.url, META_DOWNSTREAM_CRM_A_SECRET: S.a, META_DOWNSTREAM_CRM_A_MODE: "shadow",
    META_DOWNSTREAM_CRM_B_URL: crmB.url, META_DOWNSTREAM_CRM_B_SECRET: S.b, META_DOWNSTREAM_CRM_B_MODE: "shadow",
  };
  const make = (): Deps => ({ cfg: loadMetaConfig(env), store, fetchImpl: fetch, now: () => new Date(clock.t), log: () => undefined });
  const gw = await startGateway(make);
  const tick = (auth = `Bearer ${S.sched}`) => fetch(`${gw.url}/api/internal/tick`, { method: "POST", headers: { authorization: auth }, body: "{}" });

  // handshake GET
  const g = await fetch(`${gw.url}/api/meta/webhook?hub.mode=subscribe&hub.verify_token=${S.ver}&hub.challenge=abc`);
  assert.equal(g.status, 200); assert.equal(await g.text(), "abc");
  assert.equal((await fetch(`${gw.url}/api/meta/webhook?hub.mode=subscribe&hub.verify_token=no&hub.challenge=abc`)).status, 403);

  // firma errata → rifiutata e nulla persistito
  const payload = JSON.stringify({ object: "page", entry: [{ id: PAGE, time: 1, changes: [{ field: "leadgen", value: { leadgen_id: "777", page_id: PAGE, form_id: FORM, created_time: 1 } }] }] });
  const bad = await fetch(`${gw.url}/api/meta/webhook`, { method: "POST", body: payload, headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) } });
  assert.equal(bad.status, 401); assert.equal(await prisma.metaDelivery.count(), 0);

  // firma valida → 200; l'evento è già su DB (persistito prima del 200); Graph NON ancora chiamato
  const sig = metaSignature(Buffer.from(payload), S.app);
  const ok = await fetch(`${gw.url}/api/meta/webhook`, { method: "POST", body: payload, headers: { "x-hub-signature-256": sig } });
  assert.equal(ok.status, 200);
  assert.equal(await prisma.metaDelivery.count({ where: { leadgenId: "777" } }), 1);
  // reinvio identico di Meta → nessuna seconda riga
  await fetch(`${gw.url}/api/meta/webhook`, { method: "POST", body: payload, headers: { "x-hub-signature-256": sig } });
  assert.equal(await prisma.metaDelivery.count(), 1);

  // tick senza/ con auth errata → 401
  assert.equal((await tick("Bearer wrong")).status, 401);
  assert.equal((await fetch(`${gw.url}/api/internal/tick`, { method: "POST", body: "{}" })).status, 401);

  // processing SOLO via scheduler (nessuna dipendenza dalla funzione dopo la risposta)
  clock.t += 60_000;
  assert.equal((await tick()).status, 200);
  assert.equal(graphCalls, 1); // lead recuperato una sola volta
  assert.equal(crmA.got.length, 1); assert.ok(crmA.got[0].sigOk); assert.equal(crmA.got[0].mode, "shadow"); assert.equal(crmA.got[0].id, "meta_leadgen_777");
  assert.equal(crmB.got.length, 0); // spento

  // la firma di A non è valida per B (segreti distinti) e il corpo non contiene segreti Meta
  assert.ok(!verifyInternal(S.b, crmA.got[0].ts, crmA.got[0].sig, crmA.got[0].body, Math.floor(clk.t / 1000)));
  for (const s of [S.app, S.tok, S.a, S.b]) assert.ok(!crmA.got[0].body.includes(s));

  // stato per destinatario indipendente
  const ds = await prisma.metaDownstream.findMany({ orderBy: { destinatario: "asc" } });
  assert.equal(ds.find((d) => d.destinatario === "crm-a")!.stato, "DELIVERED");
  assert.equal(ds.find((d) => d.destinatario === "crm-b")!.stato, "FAILED");

  // tick ripetuti: A non riceve duplicati; B ritenta solo quando scade il backoff
  await tick(); assert.equal(crmA.got.length, 1); assert.equal(crmB.got.length, 0);
  crmB.down = false; clock.t += 10 * 60_000;
  await tick();
  assert.equal(crmB.got.length, 1); assert.ok(crmB.got[0].sigOk);
  assert.equal(crmA.got.length, 1); assert.equal(graphCalls, 1);
  clock.t += 3600_000; await tick(); await tick();
  assert.equal(crmA.got.length, 1); assert.equal(crmB.got.length, 1);
  assert.equal((await prisma.metaDownstream.findMany()).every((d) => d.stato === "DELIVERED"), true);

  // tick concorrenti: nessun invio doppio su un nuovo evento
  const p2 = payload.replaceAll("777", "778");
  await fetch(`${gw.url}/api/meta/webhook`, { method: "POST", body: p2, headers: { "x-hub-signature-256": metaSignature(Buffer.from(p2), S.app) } });
  clock.t += 60_000;
  await Promise.all(Array.from({ length: 6 }, () => tick()));
  assert.equal(crmA.got.filter((x) => x.id === "meta_leadgen_778").length, 1);
  assert.equal(crmB.got.filter((x) => x.id === "meta_leadgen_778").length, 1);

  // crash simulato: evento RECEIVED, nessuna elaborazione immediata → ripreso dallo scheduler
  const p3 = payload.replaceAll("777", "779");
  await fetch(`${gw.url}/api/meta/webhook`, { method: "POST", body: p3, headers: { "x-hub-signature-256": metaSignature(Buffer.from(p3), S.app) } });
  await prisma.metaDelivery.update({ where: { leadgenId: "779" }, data: { stato: "PROCESSING", updatedAt: new Date(clock.t - 600_000) } }); // funzione morta a metà
  clock.t += 60_000; await tick();
  assert.equal(crmA.got.filter((x) => x.id === "meta_leadgen_779").length, 1);

  // un CRM spento NON blocca l'altro anche con modalità live dichiarata solo per B
  crmA.server.close(); crmB.server.close(); graph.close(); gw.server.close();
});
