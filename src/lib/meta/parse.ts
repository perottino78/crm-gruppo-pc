import type { LeadgenEvent } from "./types";
import type { MetaConfig } from "./config";

export const MAX_PAYLOAD_BYTES = 256 * 1024;

export type ParseResult =
  | { ok: true; events: LeadgenEvent[]; skippedFields: number }
  | { ok: false; reason: "json" | "object" | "shape" };

const ID = /^\d{1,30}$/;
const str = (v: unknown): string | undefined => (typeof v === "string" || typeof v === "number" ? String(v) : undefined);

export function parseNotification(raw: Buffer | string): ParseResult {
  let body: unknown;
  try {
    body = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
  } catch {
    return { ok: false, reason: "json" };
  }
  if (!body || typeof body !== "object") return { ok: false, reason: "shape" };
  const b = body as { object?: unknown; entry?: unknown };
  if (b.object !== "page") return { ok: false, reason: "object" };
  if (!Array.isArray(b.entry)) return { ok: false, reason: "shape" };

  const events: LeadgenEvent[] = [];
  let skippedFields = 0;
  for (const entry of b.entry as Record<string, unknown>[]) {
    if (!entry || typeof entry !== "object" || !Array.isArray(entry.changes)) continue;
    for (const ch of entry.changes as Record<string, unknown>[]) {
      if (!ch || ch.field !== "leadgen") {
        skippedFields++; // solo leadgen viene elaborato
        continue;
      }
      const v = (ch.value ?? {}) as Record<string, unknown>;
      const leadgenId = str(v.leadgen_id);
      const pageId = str(v.page_id) ?? str(entry.id);
      const formId = str(v.form_id);
      if (!leadgenId || !pageId || !formId || !ID.test(leadgenId) || !ID.test(pageId) || !ID.test(formId)) {
        skippedFields++;
        continue;
      }
      const adId = str(v.ad_id);
      const adgroupId = str(v.adgroup_id);
      const created = typeof v.created_time === "number" ? v.created_time : Number(v.created_time);
      events.push({
        leadgenId,
        pageId,
        formId,
        adId: adId && ID.test(adId) ? adId : undefined,
        adgroupId: adgroupId && ID.test(adgroupId) ? adgroupId : undefined,
        createdTime: Number.isFinite(created) && created > 0 ? created : undefined,
      });
    }
  }
  return { ok: true, events, skippedFields };
}

/** Allowlist di Page ID e Form ID. Se pageIds è vuoto accetta qualsiasi pagina; se allowedFormIds è vuoto accetta qualsiasi form. */
export function authorizeEvent(ev: LeadgenEvent, cfg: Pick<MetaConfig, "pageId" | "pageIds" | "allowedFormIds">): "ok" | "page" | "form" {
  const ids = cfg.pageIds && cfg.pageIds.length > 0 ? cfg.pageIds : (cfg.pageId ? [cfg.pageId] : []);
  if (ids.length > 0 && !ids.includes(ev.pageId)) return "page";
  if (cfg.allowedFormIds.length > 0 && !cfg.allowedFormIds.includes(ev.formId)) return "form";
  return "ok";
}
