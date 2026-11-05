// Dialogo con P&C ONE per i moduli istantanei collegati da Impostazioni › Lead (senza Prisma: usato anche dal server locale).
import type { MetaConfig } from "../../src/lib/meta/config";
import { baseDi, destinatarioOne, intestazioniFirmate } from "../../src/lib/meta/moduli";

// Moduli collegati da P&C ONE (Impostazioni › Lead): ricordati per 60 s finché la funzione resta calda.
let moduliCache: { at: number; lista: string[] } | null = null;
export function ricordaModuli(lista: string[]) {
  moduliCache = { at: Date.now(), lista };
}

/** Chiede a P&C ONE quali moduli sono collegati (risposta firmata con il segreto di ONE). null = non raggiungibile. */
export async function moduliDaOne(cfg: MetaConfig, fetchImpl: typeof fetch = fetch, corpoExtra: Record<string, unknown> = {}, timeoutMs = 2500): Promise<string[] | null> {
  const one = destinatarioOne(cfg);
  if (!one) return null;
  if (!Object.keys(corpoExtra).length && moduliCache && Date.now() - moduliCache.at < 60_000) return moduliCache.lista;
  const corpo = JSON.stringify(corpoExtra);
  try {
    const res = await fetchImpl(`${baseDi(one.url)}/api/lead/meta/moduli`, { method: "POST", headers: intestazioniFirmate(one.secret, corpo), body: corpo, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return moduliCache?.lista ?? null;
    const j = (await res.json()) as { moduli?: unknown };
    const lista = Array.isArray(j.moduli) ? j.moduli.filter((x): x is string => typeof x === "string" && /^\d+$/.test(x)) : [];
    ricordaModuli(lista);
    return lista;
  } catch {
    return moduliCache?.lista ?? null;
  }
}

