// Quando può partire il rilievo (Debora, 21/11/2026): con il 50% del totale incassato (acconto più eventuali rate intermedie),
// con il finanziamento approvato (lo segna Giorgia) o se l'amministratore lo sblocca su richiesta. Modulo puro.

export const SOGLIA_RILIEVO = 0.5;

export type DatiSoglia = {
  accontoTipo: string;
  finanziamentoStato: string | null;
  totale: number;
  /** quanto ha pagato il cliente finora (acconto + rate intermedie + altro) */
  incassato: number;
  sbloccato: boolean;
};

export function sogliaRilievo(totale: number): number {
  return Math.round(totale * SOGLIA_RILIEVO * 100) / 100;
}

export function viaLiberaRilievo(d: DatiSoglia): boolean {
  if (d.sbloccato) return true;
  if (d.accontoTipo === "FINANZIAMENTO") return d.finanziamentoStato === "APPROVATO";
  if (d.totale <= 0) return d.incassato > 0.5;
  return d.incassato >= sogliaRilievo(d.totale) - 0.5;
}

/** Quanto manca al 50% (0 se raggiunto). */
export function mancaAllaSoglia(totale: number, incassato: number): number {
  return Math.max(0, Math.round((sogliaRilievo(totale) - incassato) * 100) / 100);
}
