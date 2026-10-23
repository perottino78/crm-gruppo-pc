import { test } from "node:test";
import assert from "node:assert/strict";
import { pollLeads, runSweep, handleNotification } from "../../src/lib/meta/service";
import { T, cfg, graphLead, json, makeDeps, notification, rawOf, signed } from "./helpers";

// Precedenza del webhook sul polling: un lead appena creato non deve essere "preso" dal polling
// (che consegna in shadow) prima che arrivi il webhook (che consegna in live).
const liveCfg = (extra: Record<string, string> = {}) =>
  cfg({
    META_LOCAL_INGEST: "false",
    META_POLL_ENABLED: "true",
    META_DOWNSTREAMS: "crm",
    META_DOWNSTREAM_CRM_URL: "https://crm.example.test/api/lead/meta/internal",
    META_DOWNSTREAM_CRM_SECRET: T.crmASecret,
    META_DOWNSTREAM_CRM_MODE: "live",
    ...extra,
  });

const NOW = new Date("2026-10-14T10:00:00Z").getTime();
const ago = (min: number) => new Date(NOW - min * 60_000);

function scenario(config: ReturnType<typeof cfg>, createdAt: () => Date) {
  const modes: string[] = [];
  const clock = { t: NOW };
  const made = makeDeps({
    config,
    now: () => new Date(clock.t),
    fetchImpl: async (u, init) => {
      if (u.includes("/leads?")) return json(200, { data: [graphLead({ id: T.leadgenId, created_time: createdAt().toISOString() })] });
      if (u.startsWith("https://crm.")) {
        modes.push(String((init!.headers as Record<string, string>)["x-gpc-mode"]));
        return json(200, { ok: true });
      }
      return json(200, graphLead());
    },
  });
  return { ...made, modes, clock };
}

test("Lead appena creato: il polling lo rimanda, il webhook arriva dopo e il CRM lo riceve in LIVE", async () => {
  const s = scenario(liveCfg(), () => ago(0.5)); // creato 30 secondi fa
  const p = await pollLeads(s.deps); // il giro del minuto passa PRIMA del webhook
  assert.deepEqual([p.added, p.deferred], [0, 1], "lead troppo recente: lasciato al webhook");
  const raw = rawOf(notification());
  await handleNotification({ raw, signature: signed(raw) }, s.deps);
  s.clock.t += 120_000;
  await runSweep(s.deps);
  assert.equal([...s.store.deliveries.values()][0].origine, "META");
  assert.deepEqual(s.modes, ["live"], "consegnato al CRM in live, una sola volta");
});

test("Webhook mai arrivato: dopo 10 minuti il polling recupera il lead (rete di sicurezza)", async () => {
  const s = scenario(liveCfg({ META_POLL_LIVE: "true" }), () => ago(11));
  const p = await pollLeads(s.deps);
  assert.deepEqual([p.added, p.deferred], [1, 0]);
  s.clock.t += 60_000;
  await runSweep(s.deps);
  assert.deepEqual(s.modes, ["live"], "con META_POLL_LIVE=true il recupero diventa una scheda vera");
  const again = await pollLeads(s.deps);
  assert.equal(again.duplicates, 1, "giro successivo: nessun doppione");
});

test("META_POLL_MIN_AGE_MINUTES configurabile (0 = comportamento precedente)", async () => {
  const s = scenario(liveCfg({ META_POLL_MIN_AGE_MINUTES: "0" }), () => ago(0.02));
  const p = await pollLeads(s.deps);
  assert.deepEqual([p.added, p.deferred], [1, 0]);
  assert.equal(liveCfg().pollMinAgeMinutes, 10, "default 10 minuti");
  assert.equal(liveCfg({ META_POLL_MIN_AGE_MINUTES: "abc" }).pollMinAgeMinutes, 10, "valore non valido → default");
});
