// Misure definitive di produzione: prese dai moduli dei fornitori compilati (per ora il modulo serramenti PVC; gli altri moduli si aggiungono qui).
import { N_FINESTRE } from "./serramenti";

export type MisuraModulo = { etichetta: string; misure: string; quantita: number | null };

const num = (v: string | undefined) => (v ?? "").trim().replace(",", ".");

/** Finestre scritte nel modulo serramenti (campi `tab_fin_<n>_L/H/pos/stanza/qta`): una voce per finestra con larghezza e altezza. */
export function misureDaModulo(dati: Record<string, string> | null | undefined): MisuraModulo[] {
  if (!dati) return [];
  const out: MisuraModulo[] = [];
  for (let n = 1; n <= N_FINESTRE; n++) {
    const L = num(dati[`tab_fin_${n}_L`]), H = num(dati[`tab_fin_${n}_H`]);
    if (!L || !H) continue;
    const pos = (dati[`tab_fin_${n}_pos`] ?? "").trim(), stanza = (dati[`tab_fin_${n}_stanza`] ?? "").trim();
    const q = Number(num(dati[`tab_fin_${n}_qta`]));
    out.push({ etichetta: [pos || `Finestra ${n}`, stanza].filter(Boolean).join(" · "), misure: `${L}×${H} mm`, quantita: Number.isFinite(q) && q > 0 ? q : null });
  }
  return out;
}

/** Testo da stampare dopo la descrizione della riga: le misure definitive hanno la precedenza su quelle di preventivo. */
export const conMisureDefinitive = (descrizione: string, misure?: string | null) => (misure?.trim() ? `${descrizione} — misure definitive: ${misure.trim()}` : descrizione);
