// Testo standard di condizioni di pagamento/consegna usato come default per ogni nuovo
// preventivo: viene mostrato pre-compilato nell'editor e in stampa, ma resta modificabile
// caso per caso — se il commerciale lo cambia e salva, il testo personalizzato sostituisce
// questo default solo per quel preventivo.
export const CONDIZIONI_PAGAMENTO_DEFAULT =
  "Bonifico. Acconto 50%, saldo 50% a merce pronta a magazzino.";

export const CONDIZIONI_CONSEGNA_DEFAULT =
  "Consegna 60 gg indicativi da rilievo tecnico esecutivo e da bonifico di acconto.";

// Testi fissi accanto e sotto il prezzo finale dell'offerta stampata (richiesta di Rocco, nov 2026).
export const NOTA_FATTIBILITA = "Previa fattibilità tecnica";
export const SPESE_ISTRUTTORIA = 400;
export const CLAUSOLA_ISTRUTTORIA = `Spese di istruttoria ai sensi dell'articolo n. 1 delle condizioni generali del contratto: € ${SPESE_ISTRUTTORIA}`;

/** «Offerta valida fino al 26/11/2026» (data di Roma), o null se l'offerta non ha scadenza. */
export function testoValidita(scadenza: Date | null | undefined): string | null {
  if (!scadenza) return null;
  return `Offerta valida fino al ${scadenza.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" })}`;
}
