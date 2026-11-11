// Elenco dei lead (richiesta di Rocco, nov 2026): viste Oggi / Scaduti / In programma e ricerca «Tutti» come un estratto conto,
// per data del task. Funzioni pure, testate in tests/lead/elenco.test.ts.

export type Vista = "oggi" | "scaduti" | "programma" | "chiusi" | "tutti";
export const VISTE: Vista[] = ["oggi", "scaduti", "programma", "chiusi", "tutti"];
export const vistaDa = (s?: string | null): Vista => (VISTE.includes(s as Vista) ? (s as Vista) : s === "dafare" ? "oggi" : "oggi");

/** Data del task del lead: la scadenza dell'azione, altrimenti quando è arrivato. */
export const dataTask = (l: { scadenzaAzione: Date | null; createdAt: Date }) => l.scadenzaAzione ?? l.createdAt;

/** In quale vista cade un lead aperto: senza data o con data oggi → oggi; prima di oggi → scaduti; dopo → in programma. */
export function vistaDiScadenza(scadenza: Date | null, inizioOggi: Date, fineOggi: Date): "oggi" | "scaduti" | "programma" {
  if (!scadenza) return "oggi";
  if (scadenza < inizioOggi) return "scaduti";
  if (scadenza >= fineOggi) return "programma";
  return "oggi";
}

/** Conteggio per giorno (chiavi «aaaa-mm-gg» già calcolate in ora di Roma). */
export function conteggiPerGiorno(chiavi: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of chiavi) out[k] = (out[k] ?? 0) + 1;
  return out;
}

/** Griglia del mese «aaaa-mm» con le settimane da lunedì: null = casella vuota. */
export function grigliaMese(mese: string): (string | null)[][] {
  const [a, m] = mese.split("-").map(Number);
  const primo = new Date(Date.UTC(a, m - 1, 1));
  const giorni = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const vuote = (primo.getUTCDay() + 6) % 7; // lunedì = 0
  const celle: (string | null)[] = [...Array(vuote).fill(null), ...Array.from({ length: giorni }, (_, i) => `${mese}-${String(i + 1).padStart(2, "0")}`)];
  while (celle.length % 7) celle.push(null);
  return Array.from({ length: celle.length / 7 }, (_, i) => celle.slice(i * 7, i * 7 + 7));
}

export const meseDi = (giorno: string) => giorno.slice(0, 7);
export function meseVicino(mese: string, delta: number): string {
  const [a, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Raggruppa per giorno, dal più recente al più vecchio (come le movimentazioni di un conto). */
export function perGiornoDecrescente<T>(righe: T[], giornoDi: (r: T) => string): { giorno: string; righe: T[] }[] {
  const mappa = new Map<string, T[]>();
  for (const r of righe) { const g = giornoDi(r); mappa.set(g, [...(mappa.get(g) ?? []), r]); }
  return [...mappa.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([giorno, righe]) => ({ giorno, righe }));
}
