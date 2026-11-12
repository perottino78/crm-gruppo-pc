// Schede tecniche dei listini per il cliente (richiesta di Ugo, nov 2026): descrizione tecnica breve e link nell'offerta stampata,
// riquadro nel configuratore per il commerciale, spunta «allega» che stampa le pagine della scheda in fondo all'offerta e manda il PDF
// con l'email. Modulo puro (anche nel browser): per aggiungere un listino basta una voce in SCHEDE, con il PDF in public/cataloghi/<listino>/
// e le pagine come immagini in public/cataloghi/<listino>/pagine/p-<n>.jpg (pdftoppm -jpeg -jpegopt quality=80 -r 110 <pdf> <cartella>/p).
import { PREFISSO_OPTIMA, DESCRIZIONE_CLIENTE_OPTIMA, CATALOGHI_OPTIMA } from "../listini/optima";

export type SchedaCliente = {
  /** chiave salvata in Preventivo.schedeAllegate */
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

/** Le schede spuntate che valgono ancora (il prodotto è ancora nell'offerta). */
export function schedeDaAllegare(spuntate: string[], tipologie: (string | null | undefined)[]): SchedaCliente[] {
  return schedeDelleTipologie(tipologie).filter((s) => spuntate.includes(s.chiave));
}
