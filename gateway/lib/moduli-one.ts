// Dialogo con P&C ONE per i moduli istantanei collegati da Impostazioni › Lead (senza Prisma: usato anche dal server locale).
import type { MetaConfig } from "../../src/lib/meta/config";
import { baseDi, destinatarioOne, intestazioniFirmate } from "../../src/lib/meta/moduli";

// Moduli collegati da P&C ONE (Impostazioni › Lead): ricordati per 60 s finché la funzione resta calda.
/** Da P&C ONE: moduli e pagine collegati e chiavi delle pagine incollate in Impostazioni › Lead. */
export type DaOne = { moduli: string[]; pagine: string[]; token?: Record<string, string> };
let moduliCache: { at: number; dati: DaOne } | null = null;
export function ricordaModuli(dati: DaOne | null) {
  moduliCache = dati ? { at: Date.now(), dati } : null;
}

/** Chiede a P&C ONE quali moduli (e pagine) sono collegati (richiesta firmata con il segreto di ONE). null = non raggiungibile. */
export async function moduliDaOne(cfg: MetaConfig, fetchImpl: typeof fetch = fetch, corpoExtra: Record<string, unknown> = {}, timeoutMs = 2500): Promise<DaOne | null> {
  const one = destinatarioOne(cfg);
  if (!one) return null;
  if (!Object.keys(corpoExtra).length && moduliCache && Date.now() - moduliCache.at < 60_000) return moduliCache.dati;
  const corpo = JSON.stringify(corpoExtra);
  try {
    const res = await fetchImpl(`${baseDi(one.url)}/api/lead/meta/moduli`, { method: "POST", headers: intestazioniFirmate(one.secret, corpo), body: corpo, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return moduliCache?.dati ?? null;
    const j = (await res.json()) as { moduli?: unknown; pagine?: unknown; token?: unknown };
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^\d+$/.test(x)) : []);
    const token: Record<string, string> = {};
    if (j.token && typeof j.token === "object") for (const [k, v] of Object.entries(j.token as Record<string, unknown>)) if (/^\d+$/.test(k) && typeof v === "string" && v.length > 20) token[k] = v;
    const dati = { moduli: ids(j.moduli), pagine: ids(j.pagine), token };
    ricordaModuli(dati);
    return dati;
  } catch {
    return moduliCache?.dati ?? null;
  }
}

