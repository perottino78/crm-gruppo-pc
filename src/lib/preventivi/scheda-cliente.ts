// Descrizione tecnica breve e collegamento alla scheda tecnica, stampati nell'offerta sotto il riepilogo del prodotto.
// Modulo puro: per aggiungere un listino basta una voce in SCHEDE.
import { PREFISSO_OPTIMA, DESCRIZIONE_CLIENTE_OPTIMA, CATALOGHI_OPTIMA } from "../listini/optima";

export type SchedaCliente = { descrizione: string; link: { nome: string; url: string } | null };

const SCHEDE: { prefisso: string; scheda: SchedaCliente }[] = [
  { prefisso: PREFISSO_OPTIMA, scheda: { descrizione: DESCRIZIONE_CLIENTE_OPTIMA, link: CATALOGHI_OPTIMA[0] ?? null } },
];

/** La scheda per il cliente del modello, o null se il listino non ne ha una. */
export function schedaCliente(tipologia: string): SchedaCliente | null {
  return SCHEDE.find((s) => tipologia.startsWith(s.prefisso))?.scheda ?? null;
}
