// Tabelle di finanziamento (dal simulatore Deutsche Bank, prodotto «Casa grandi interventi»).
// Funzioni pure: la lettura di eventuali tabelle modificate in Impostazioni sta in server.ts.
import { arrotondaCent, contributoENetto, pianoFinanziamento, type DatiFinanziamento } from "./calcoli";

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
  speseIncassoRata: number; // € per rata (1,5 nel simulatore; 0 sulle promo)
};

export const TABELLE_PREDEFINITE: TabellaFinanziamento[] = [
  { id: "TAN699_90", nome: "TAN 6,99% — prima rata a 90 giorni", importoMin: 1000, importoMax: 55000, rateDa: 12, rateA: 120, giorniPrimaRata: 90, tan: 6.99, tassoRendimento: 6.99, speseIncassoRata: 1.5 },
  { id: "ZERO_90", nome: "Tasso zero — prima rata a 90 giorni", importoMin: 1000, importoMax: 55000, rateDa: 12, rateA: 120, giorniPrimaRata: 90, tan: 0, tassoRendimento: 6.5, speseIncassoRata: 1.5 },
  { id: "PROMO_ZERO_10", nome: "Promo tasso zero — 10 rate, prima rata a 30 giorni", importoMin: 1000, importoMax: 55000, rateDa: 10, rateA: 10, giorniPrimaRata: 30, tan: 0, tassoRendimento: 6.5, speseIncassoRata: 0 },
  { id: "PROMO_ZERO_20", nome: "Promo tasso zero — 20 rate, prima rata a 30 giorni", importoMin: 1000, importoMax: 55000, rateDa: 20, rateA: 20, giorniPrimaRata: 30, tan: 0, tassoRendimento: 6.5, speseIncassoRata: 0 },
];

// Se c'è `pagaSubito` (cifra mista) il finanziato è sempre il totale meno quella cifra, anche se il totale cambia.
export type SceltaFinanziamento = { tabellaId: string; rate: number; importoFinanziato?: number; pagaSubito?: number };

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
  const { rate } = scelta;
  const importoFinanziato = scelta.pagaSubito != null ? arrotondaCent(totaleOfferta - scelta.pagaSubito) : (scelta.importoFinanziato ?? totaleOfferta);
  if (scelta.pagaSubito != null && (scelta.pagaSubito < 0 || scelta.pagaSubito > totaleOfferta)) return { ok: false, errore: "La cifra pagata subito non può superare il totale dell'offerta." };
  if (!Number.isFinite(importoFinanziato) || importoFinanziato < t.importoMin || importoFinanziato > t.importoMax)
    return { ok: false, errore: `Importo finanziato da ${t.importoMin} a ${t.importoMax} €.` };
  if (importoFinanziato > totaleOfferta + 0.005) return { ok: false, errore: "L'importo finanziato supera il totale dell'offerta." };
  if (!Number.isInteger(rate) || rate < t.rateDa || rate > t.rateA) return { ok: false, errore: `Numero rate da ${t.rateDa} a ${t.rateA}.` };
  const d: DatiFinanziamento = { importo: importoFinanziato, tanPercentuale: t.tan, rate, mesiPrimaRata: t.giorniPrimaRata / 30, speseIncassoRata: t.speseIncassoRata };
  const piano = pianoFinanziamento(d, t.tassoRendimento);
  const { contributo, nettoErogato } = contributoENetto(d, t.tassoRendimento);
  return {
    ok: true, tabella: t, rate, importoFinanziato,
    anticipoDiretto: arrotondaCent(totaleOfferta - importoFinanziato),
    rata: piano.rataTotale,
    totaleDovuto: piano.totaleDovuto,
    taeg: piano.taeg,
    costoPerNoi: contributo,
    nettoErogato,
  };
}

/** Controlla e pulisce una tabella scritta a mano in Impostazioni: ritorna la tabella o il testo dell'errore. */
export function normalizzaTabella(r: Partial<Record<keyof TabellaFinanziamento, unknown>>): TabellaFinanziamento | string {
  const n = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")));
  const nome = String(r.nome ?? "").trim();
  if (!nome) return "Scrivi il nome della tabella.";
  const t: TabellaFinanziamento = {
    id: String(r.id ?? "").trim(), nome,
    importoMin: n(r.importoMin), importoMax: n(r.importoMax), rateDa: Math.round(n(r.rateDa)), rateA: Math.round(n(r.rateA)),
    giorniPrimaRata: Math.round(n(r.giorniPrimaRata)), tan: n(r.tan), tassoRendimento: n(r.tassoRendimento),
    speseIncassoRata: r.speseIncassoRata == null || r.speseIncassoRata === "" ? 1.5 : n(r.speseIncassoRata),
  };
  if (![t.importoMin, t.importoMax, t.rateDa, t.rateA, t.giorniPrimaRata, t.tan, t.tassoRendimento, t.speseIncassoRata].every(Number.isFinite)) return "Controlla i numeri: uno non è valido.";
  if (t.importoMin <= 0 || t.importoMax < t.importoMin) return "Importo massimo deve essere maggiore del minimo.";
  if (t.rateDa < 1 || t.rateA < t.rateDa) return "Il numero massimo di rate deve essere almeno quello minimo.";
  if (![30, 60, 90, 120].includes(t.giorniPrimaRata)) return "Prima rata a 30, 60, 90 o 120 giorni.";
  if (t.speseIncassoRata < 0 || t.speseIncassoRata > 20) return "Spese di incasso a rata fra 0 e 20 €.";
  if (t.tan < 0 || t.tan > 30 || t.tassoRendimento < 0 || t.tassoRendimento > 30) return "TAN e tasso di rendimento fra 0 e 30%.";
  if (!t.id) t.id = "T" + Math.random().toString(36).slice(2, 8).toUpperCase();
  return t;
}
