// Tabelle di finanziamento (dal simulatore Deutsche Bank, prodotto «Casa grandi interventi»).
// Funzioni pure: la lettura di eventuali tabelle modificate in Impostazioni sta in server.ts.
import { arrotondaCent, contributoENetto, rataMensile, taeg, type DatiFinanziamento } from "./calcoli";

export type TabellaFinanziamento = {
  id: string;
  nome: string;
  importoMin: number;
  importoMax: number;
  rateDa: number;
  rateA: number;
  giorniPrimaRata: number; // 30 o 90
  tan: number; // % applicato al cliente
  tassoRendimento: number; // % usato per il contributo del negoziante
};

export const TABELLE_PREDEFINITE: TabellaFinanziamento[] = [
  { id: "TAN699_90", nome: "TAN 6,99% — prima rata a 90 giorni", importoMin: 1000, importoMax: 55000, rateDa: 12, rateA: 120, giorniPrimaRata: 90, tan: 6.99, tassoRendimento: 6.99 },
  { id: "ZERO_90", nome: "Tasso zero — prima rata a 90 giorni", importoMin: 1000, importoMax: 55000, rateDa: 12, rateA: 120, giorniPrimaRata: 90, tan: 0, tassoRendimento: 6.5 },
  { id: "PROMO_ZERO_10", nome: "Promo tasso zero — 10 rate, prima rata a 30 giorni", importoMin: 1000, importoMax: 55000, rateDa: 10, rateA: 10, giorniPrimaRata: 30, tan: 0, tassoRendimento: 6.5 },
  { id: "PROMO_ZERO_20", nome: "Promo tasso zero — 20 rate, prima rata a 30 giorni", importoMin: 1000, importoMax: 55000, rateDa: 20, rateA: 20, giorniPrimaRata: 30, tan: 0, tassoRendimento: 6.5 },
];

export const SPESE_INCASSO_RATA = 2;

export type SceltaFinanziamento = { tabellaId: string; rate: number; importoFinanziato: number };

export type EsitoFinanziamento =
  | { ok: false; errore: string }
  | {
      ok: true;
      tabella: TabellaFinanziamento;
      rate: number;
      importoFinanziato: number;
      anticipoDiretto: number; // quanto paga il cliente senza finanziamento
      rata: number;
      totaleDovuto: number; // rate + spese di incasso
      taeg: number;
      costoPerNoi: number; // contributo trattenuto dalla finanziaria
      nettoErogato: number;
    };

export function calcolaFinanziamento(scelta: SceltaFinanziamento, totaleOfferta: number, tabelle = TABELLE_PREDEFINITE): EsitoFinanziamento {
  const t = tabelle.find((x) => x.id === scelta.tabellaId);
  if (!t) return { ok: false, errore: "Tabella di finanziamento non trovata." };
  const { rate, importoFinanziato } = scelta;
  if (!Number.isFinite(importoFinanziato) || importoFinanziato < t.importoMin || importoFinanziato > t.importoMax)
    return { ok: false, errore: `Importo finanziato da ${t.importoMin} a ${t.importoMax} €.` };
  if (importoFinanziato > totaleOfferta + 0.005) return { ok: false, errore: "L'importo finanziato supera il totale dell'offerta." };
  if (!Number.isInteger(rate) || rate < t.rateDa || rate > t.rateA) return { ok: false, errore: `Numero rate da ${t.rateDa} a ${t.rateA}.` };
  const d: DatiFinanziamento = { importo: importoFinanziato, tanPercentuale: t.tan, rate, mesiPrimaRata: t.giorniPrimaRata / 30, speseIncassoRata: SPESE_INCASSO_RATA };
  const rata = rataMensile(importoFinanziato, t.tan, rate);
  const { contributo, nettoErogato } = contributoENetto(d, t.tassoRendimento);
  return {
    ok: true, tabella: t, rate, importoFinanziato,
    anticipoDiretto: arrotondaCent(totaleOfferta - importoFinanziato),
    rata,
    totaleDovuto: arrotondaCent((rata + SPESE_INCASSO_RATA) * rate),
    taeg: taeg(d, rata),
    costoPerNoi: contributo,
    nettoErogato,
  };
}
