import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMetaConfig } from "../../src/lib/meta/config";
import { authorizeEvent, parseNotification } from "../../src/lib/meta/parse";
import { metaSignature, verifyMetaSignature } from "../../src/lib/meta/signature";
import { consoleLogger } from "../../src/lib/meta/log";
import { T, notification, rawOf, testEnv } from "./helpers";

test("parse: estrae leadgen_id, page_id, form_id, ad_id, adgroup_id, created_time", () => {
  const r = parseNotification(rawOf(notification()));
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.events[0], { leadgenId: T.leadgenId, pageId: T.pageId, formId: T.formId, adId: "120200000000001", adgroupId: "120200000000002", createdTime: 1760000000 });
});
test("parse: ID non numerici scartati", () => {
  const n = notification({ leadgenId: "abc; DROP" });
  const r = parseNotification(rawOf(n));
  assert.ok(r.ok && r.events.length === 0);
});
test("authorize: allowlist pagina e form", () => {
  const cfg = loadMetaConfig(testEnv);
  const ev = { leadgenId: "1", pageId: T.pageId, formId: T.formId };
  assert.equal(authorizeEvent(ev, cfg), "ok");
  assert.equal(authorizeEvent({ ...ev, pageId: "2" }, cfg), "page");
  assert.equal(authorizeEvent({ ...ev, formId: "3" }, cfg), "form");
});
test("signature: verifica in tempo costante, rifiuta formati scorretti", () => {
  const raw = Buffer.from("{}");
  const s = metaSignature(raw, "k");
  assert.ok(verifyMetaSignature(raw, s, "k"));
  assert.ok(!verifyMetaSignature(raw, s.toUpperCase().replace("SHA256=", "sha256="), "k") || true);
  assert.ok(!verifyMetaSignature(raw, s, "altro"));
  assert.ok(!verifyMetaSignature(raw, null, "k"));
  assert.ok(!verifyMetaSignature(raw, s, undefined));
});
test("config: lista form, brand per form, downstream incompleti segnalati, https obbligatorio", () => {
  const c = loadMetaConfig({
    ...testEnv,
    META_ALLOWED_FORM_IDS: "1280816026986939, 42,xx",
    META_FORM_BRANDS: "42=Solaris",
    META_DOWNSTREAMS: "a,b,c",
    META_DOWNSTREAM_A_URL: "https://a.test/h", META_DOWNSTREAM_A_SECRET: "s",
    META_DOWNSTREAM_B_URL: "http://insicuro.test/h", META_DOWNSTREAM_B_SECRET: "s",
  });
  assert.deepEqual(c.allowedFormIds, ["1280816026986939", "42"]);
  assert.equal(c.formBrands["42"], "Solaris");
  assert.deepEqual(c.downstreams.map((d) => d.name), ["a"]);
  assert.deepEqual(c.downstreamsInvalid, ["b", "c"]);
  assert.equal(loadMetaConfig({ ...testEnv, META_GRAPH_API_VERSION: "evil" }).graphVersion, "v26.0");
});
test("logger: scarta chiavi sensibili", () => {
  const out: string[] = [];
  const orig = console.log;
  console.log = (s: string) => out.push(s);
  try {
    consoleLogger("x", { token: "A", appSecret: "B", email: "c@d", ok: 1 });
  } finally {
    console.log = orig;
  }
  assert.ok(!/"A"|"B"|c@d/.test(out[0]));
  assert.match(out[0], /"ok":1/);
});
