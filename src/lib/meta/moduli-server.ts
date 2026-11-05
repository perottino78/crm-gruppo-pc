// Moduli istantanei di Meta lato P&C ONE: elenco collegato (Impostazioni › Lead), catalogo letto dal gateway, moduli scartati,
// richieste firmate al gateway e recupero dei lead di un modulo.
import { prisma } from "@/lib/prisma";
import { getConfig, setConfig } from "@/lib/leadIngest";
import { loadMetaConfig, type MetaConfig } from "./config";
import { mapLead } from "./mapping";
import { prismaLeadSink } from "./prismaSink";
import type { GraphLead, LeadgenEvent } from "./types";
import {
  CHIAVE_CATALOGO, CHIAVE_GATEWAY, CHIAVE_MODULI, CHIAVE_SCARTATI, annotaScartato, intestazioniFirmate, leggiModuli, pulisciCatalogo, unisciModuli,
  type CatalogoMeta, type ModuloMeta, type Scartati,
} from "./moduli";

export async function moduliCollegati(): Promise<ModuloMeta[]> {
  return leggiModuli(await getConfig(CHIAVE_MODULI));
}
export async function salvaModuli(lista: ModuloMeta[]) {
  await setConfig(CHIAVE_MODULI, JSON.stringify(lista));
}
/** Configurazione Meta effettiva: variabili di Vercel + moduli collegati dal CRM. */
export async function cfgConModuli(base: MetaConfig = loadMetaConfig()): Promise<MetaConfig> {
  return unisciModuli(base, await moduliCollegati());
}
export async function catalogo(): Promise<CatalogoMeta | null> {
  try { return pulisciCatalogo(JSON.parse((await getConfig(CHIAVE_CATALOGO)) ?? "null")); } catch { return null; }
}
export async function salvaCatalogo(c: CatalogoMeta) {
  await setConfig(CHIAVE_CATALOGO, JSON.stringify(c));
}
export async function scartati(): Promise<Scartati> {
  try { return JSON.parse((await getConfig(CHIAVE_SCARTATI)) ?? "{}") as Scartati; } catch { return {}; }
}
export async function registraScartato(ev: LeadgenEvent) {
  await setConfig(CHIAVE_SCARTATI, JSON.stringify(annotaScartato(await scartati(), ev, new Date())));
}
export async function indirizzoGateway(): Promise<string | null> {
  const u = await getConfig(CHIAVE_GATEWAY);
  return u && /^https:\/\/[a-z0-9.-]+$/i.test(u) ? u : null;
}
export async function salvaIndirizzoGateway(u: unknown) {
  if (typeof u === "string" && /^https:\/\/[a-z0-9.-]+\/?$/i.test(u)) await setConfig(CHIAVE_GATEWAY, u.replace(/\/$/, ""));
}

/** Richiesta firmata al gateway (che ha le chiavi di Meta). */
export async function chiediAlGateway<T>(corpo: Record<string, unknown>, timeoutMs = 45_000): Promise<{ ok: true; dati: T } | { ok: false; errore: string }> {
  const url = await indirizzoGateway();
  const segreto = loadMetaConfig().internalSecret;
  if (!url) return { ok: false, errore: "Il gateway non si è ancora presentato: si collega da solo entro 5 minuti dalla pubblicazione. Riprova tra poco." };
  if (!segreto) return { ok: false, errore: "Manca META_INTERNAL_SECRET nelle variabili di Vercel di P&C ONE." };
  const testo = JSON.stringify(corpo);
  try {
    const res = await fetch(`${url}/api/internal/one`, { method: "POST", headers: intestazioniFirmate(segreto, testo), body: testo, signal: AbortSignal.timeout(timeoutMs) });
    const j = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
    if (res.status === 401) return { ok: false, errore: "Il gateway non riconosce la firma di P&C ONE (segreto diverso)." };
    if (!res.ok || !j?.ok) return { ok: false, errore: j?.error ?? `Il gateway ha risposto ${res.status}` };
    return { ok: true, dati: j };
  } catch {
    return { ok: false, errore: "Il gateway non risponde: riprova tra poco." };
  }
}

/** Note del lead come per gli arrivi automatici («Meta Lead Ads · Campagna: … · domanda: risposta»). */
export const noteDaGraph = (lead: GraphLead) => {
  const m = mapLead(lead);
  return { m, note: ["Meta Lead Ads", lead.campaign_name ? `Campagna: ${lead.campaign_name}` : "", m.extra].filter(Boolean).join(" · ") };
};

/** Mette in P&C ONE i lead letti da Meta per un modulo: quelli già presenti (stesso ID di Meta o stesso contatto) non si doppiano. */
export async function importaLeadDaGraph(leads: GraphLead[], formId: string, brand: string): Promise<{ nuovi: number; gia: number; scartati: number }> {
  const out = { nuovi: 0, gia: 0, scartati: 0 };
  const esistenti = new Set((await prisma.lead.findMany({ where: { metaLeadgenId: { in: leads.map((l) => l.id) } }, select: { metaLeadgenId: true } })).map((l) => l.metaLeadgenId));
  // dal più vecchio al più recente, così l'ordine di arrivo resta quello vero
  for (const lead of [...leads].reverse()) {
    if (lead.form_id !== formId) { out.scartati++; continue; }
    if (esistenti.has(lead.id)) { out.gia++; continue; }
    const { m, note } = noteDaGraph(lead);
    const r = await prismaLeadSink.ingest({ externalId: lead.id, nome: m.nome || "Contatto Meta", telefono: m.telefono, email: m.email, brand, note, formId, adId: lead.ad_id ?? null });
    if (!r.ok) out.scartati++;
    else if (r.duplicate) out.gia++;
    else out.nuovi++;
  }
  return out;
}

/** Quanti lead sono arrivati in P&C ONE per ogni modulo (e quando l'ultimo). */
export async function arriviPerModulo(): Promise<Map<string, { n: number; ultimo: Date | null; n30: number }>> {
  const dal = new Date(Date.now() - 30 * 86400_000);
  const [tutti, recenti] = await Promise.all([
    prisma.lead.groupBy({ by: ["metaFormId"], where: { metaFormId: { not: null } }, _count: true, _max: { createdAt: true } }),
    prisma.lead.groupBy({ by: ["metaFormId"], where: { metaFormId: { not: null }, createdAt: { gte: dal } }, _count: true }),
  ]);
  const m = new Map<string, { n: number; ultimo: Date | null; n30: number }>();
  for (const t of tutti) m.set(t.metaFormId!, { n: t._count, ultimo: t._max.createdAt, n30: recenti.find((r) => r.metaFormId === t.metaFormId)?._count ?? 0 });
  return m;
}
