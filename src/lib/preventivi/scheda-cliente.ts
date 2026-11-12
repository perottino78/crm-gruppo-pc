// Schede tecniche dei listini per il cliente (richiesta di Ugo, nov 2026): descrizione tecnica breve e link nell'offerta stampata,
// riquadro nel configuratore per il commerciale, spunta «allega» su ogni prodotto dell'offerta che stampa le pagine della scheda in fondo all'offerta e manda il PDF
// con l'email. Modulo puro (anche nel browser): per aggiungere un listino basta una voce in SCHEDE, con il PDF in public/cataloghi/<listino>/
// e le pagine come immagini in public/cataloghi/<listino>/pagine/p-<n>.jpg (pdftoppm -jpeg -jpegopt quality=80 -r 110 <pdf> <cartella>/p).
import { PREFISSO_OPTIMA, DESCRIZIONE_CLIENTE_OPTIMA, CATALOGHI_OPTIMA } from "../listini/optima";
import { PREFISSO_PLASMA30, PREFISSO_PLASMA30_TV, DESCRIZIONE_CLIENTE_PLASMA30, DESCRIZIONE_CLIENTE_PLASMA30_TV, CATALOGHI_PLASMA30 } from "../listini/plasma30";

export type SchedaCliente = {
  /** chiave del listino (una scheda per listino) */
  chiave: string;
  nome: string;
  descrizione: string;
  /** PDF pubblico (cartella public) */
  pdf: string;
  /** pagine del PDF come immagini, per stamparle in fondo all'offerta */
  pagine: string[];
};

const pagine = (cartella: string, n: number) => Array.from({ length: n }, (_, i) => `${cartella}/pagine/p-${i + 1}.jpg`);

const SCHEDE: { prefisso: string; scheda: SchedaCliente }[] = [
  {
    prefisso: PREFISSO_OPTIMA,
    scheda: { chiave: "OPTIMA", nome: CATALOGHI_OPTIMA[0].nome, descrizione: DESCRIZIONE_CLIENTE_OPTIMA, pdf: CATALOGHI_OPTIMA[0].url, pagine: pagine("/cataloghi/optima", 8) },
  },
  // Plasma 30: stessa scheda per doppio e triplo vetro (stessa chiave: allegata una volta sola), descrizione diversa
  {
    prefisso: PREFISSO_PLASMA30,
    scheda: { chiave: "PLASMA30", nome: CATALOGHI_PLASMA30[0].nome, descrizione: DESCRIZIONE_CLIENTE_PLASMA30, pdf: CATALOGHI_PLASMA30[0].url, pagine: pagine("/cataloghi/plasma30", 16) },
  },
  {
    prefisso: PREFISSO_PLASMA30_TV,
    scheda: { chiave: "PLASMA30", nome: CATALOGHI_PLASMA30[0].nome, descrizione: DESCRIZIONE_CLIENTE_PLASMA30_TV, pdf: CATALOGHI_PLASMA30[0].url, pagine: pagine("/cataloghi/plasma30", 16) },
  },
];

/** La scheda per il cliente del modello, o null se il listino non ne ha una. */
export function schedaCliente(tipologia: string): SchedaCliente | null {
  return SCHEDE.find((s) => tipologia.startsWith(s.prefisso))?.scheda ?? null;
}

/** Le schede dei prodotti di un'offerta, una sola volta ciascuna, nell'ordine delle righe. */
export function schedeDelleTipologie(tipologie: (string | null | undefined)[]): SchedaCliente[] {
  const viste = new Map<string, SchedaCliente>();
  for (const t of tipologie) {
    const s = t ? schedaCliente(t) : null;
    if (s && !viste.has(s.chiave)) viste.set(s.chiave, s);
  }
  return [...viste.values()];
}

/** Le schede da stampare e allegare: quelle dei prodotti con la spunta «allega», una volta ciascuna. */
export function schedeDaAllegare(righe: { tipologia?: string | null; allegaScheda: boolean }[]): SchedaCliente[] {
  return schedeDelleTipologie(righe.filter((r) => r.allegaScheda).map((r) => r.tipologia));
}
