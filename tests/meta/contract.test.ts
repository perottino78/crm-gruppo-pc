import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { handleInternalEvent, eventIdFor } from "../../src/lib/meta/service";
import { signInternal, verifyInternal } from "../../src/lib/meta/signature";
import { cfg, makeDeps, T } from "./helpers";

const d = (f: string) => readFileSync(new URL(`../../docs/contract/${f}`, import.meta.url), "utf8");
const schema = JSON.parse(d("downstream-v1.schema.json"));
const ajv = addFormats(new Ajv2020({ strict: true }));
const validate = ajv.compile(schema);

test("esempi validi rispetto allo JSON Schema", () => {
  for (const f of ["example-full.json", "example-minimal-nulls.json", "example-no-lead.json"]) {
    const ok = validate(JSON.parse(d(f)));
    assert.ok(ok, `${f}: ${JSON.stringify(validate.errors)}`);
  }
});

test("lo schema rifiuta payload non conformi", () => {
  const base = JSON.parse(d("example-full.json"));
  for (const bad of [{ ...base, schema_version: 2 }, { ...base, mode: "test" }, { ...base, event_id: "x" }, { ...base, leadgen_id: "abc" }, { ...base, lead: { ...base.lead, field_data: [{ name: "a", values: "x" }] } }]) {
    assert.equal(validate(bad), false);
  }
  const { lead: _l, ...noLead } = base; assert.equal(validate(noLead), false); // 'lead' è obbligatorio (anche se null)
});

test("test vector: firma esadecimale minuscola, confermata con OpenSSL indipendente", () => {
  const v = JSON.parse(d("test-vector.json"));
  const body = v.raw_body as string;
  assert.equal(body + "\n", d("example-full.json"));
  const sig = signInternal(v.secret, v.timestamp, body);
  assert.equal(sig, v.headers["X-GPC-Signature"]);
  assert.match(sig, /^v1=[0-9a-f]{64}$/);
  const ssl = execFileSync("openssl", ["dgst", "-sha256", "-hmac", v.secret, "-hex"], { input: `${v.timestamp}.${body}` }).toString().trim().split(" ").pop();
  assert.equal(sig, `v1=${ssl}`);
  assert.ok(verifyInternal(v.secret, v.timestamp, sig, body, Number(v.timestamp) + 100));
  assert.equal(verifyInternal(v.secret, v.timestamp, sig, body, Number(v.timestamp) + 301), false); // fuori finestra
  assert.equal(verifyInternal(v.secret, v.timestamp, sig, body + " ", Number(v.timestamp)), false); // corpo alterato
});

test("rotazione segreto: il ricevente accetta corrente e successivo", async () => {
  const body = JSON.stringify({ x: 1 });
  const mk = (extra: Record<string, string>) => makeDeps({ config: cfg(extra) });
  const old = "OLD_SECRET_0123456789abcdef0123456789abcdef", nu = "NEW_SECRET_0123456789abcdef0123456789abcdef";
  const status = async (secretCfg: Record<string, string>, signWith: string) => {
    const { deps } = mk(secretCfg);
    const ts = String(Math.floor(deps.now().getTime() / 1000));
    return (await handleInternalEvent({ raw: Buffer.from(body), timestamp: ts, signature: signInternal(signWith, ts, body) }, deps)).status;
  };
  assert.notEqual(await status({ META_INTERNAL_SECRET: old }, old), 401);
  assert.equal(await status({ META_INTERNAL_SECRET: old }, nu), 401);
  assert.notEqual(await status({ META_INTERNAL_SECRET: old, META_INTERNAL_SECRET_NEXT: nu }, nu), 401); // finestra di rotazione
  assert.notEqual(await status({ META_INTERNAL_SECRET: old, META_INTERNAL_SECRET_NEXT: nu }, old), 401);
  assert.equal(await status({ META_INTERNAL_SECRET: nu }, old), 401); // vecchio revocato
  void T; void eventIdFor;
});
