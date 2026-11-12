// A/B test delle campagne (richiesta di Rocco, nov 2026): il pubblico si divide in parti uguali fra i gruppi. Funzioni pure, testate.
import { createHash } from "crypto";

export const MIN_GRUPPI = 2;
export const MAX_GRUPPI = 10;
export const nomeGruppo = (i: number) => `Gruppo ${String.fromCharCode(65 + i)}`;
export const numeroGruppi = (n: unknown) => Math.min(MAX_GRUPPI, Math.max(MIN_GRUPPI, Math.round(Number(n)) || MIN_GRUPPI));

/**
 * A quale gruppo va ogni nuovo contatto. Ordine «mescolato» ma sempre uguale (impronta di campagna + contatto: niente favoriti
 * per ordine alfabetico o di arrivo), e ognuno al gruppo che ne ha meno finora: i gruppi restano pari anche se la campagna
 * si rimanda più avanti ai nuovi che rientrano nei filtri. Ritorna l'indice del gruppo per ogni contatto.
 */
export function assegnaGruppi(campagnaId: string, contatti: string[], giaNeiGruppi: number[]): Map<string, number> {
  const conti = [...giaNeiGruppi];
  const ordine = [...new Set(contatti)].map((id) => ({ id, k: createHash("sha1").update(`${campagnaId}:${id}`).digest("hex") })).sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  const out = new Map<string, number>();
  for (const { id } of ordine) {
    let g = 0;
    for (let i = 1; i < conti.length; i++) if (conti[i] < conti[g]) g = i;
    out.set(id, g);
    conti[g]++;
  }
  return out;
}

/** Quanti contatti per gruppo (per mostrarlo prima dell'invio): i primi gruppi prendono quello che avanza. */
export function divisione(totale: number, gruppi: number): number[] {
  const base = Math.floor(totale / gruppi), resto = totale % gruppi;
  return Array.from({ length: gruppi }, (_, i) => base + (i < resto ? 1 : 0));
}
