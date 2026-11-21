// Interventi del progetto (Ugo, 21/11/2026): dopo una posa parziale, o in qualsiasi momento, dentro la pratica si apre un intervento
// per finire il lavoro, una manutenzione, un sopralluogo o un secondo rilievo. Può chiedere materiale (si torna all'ufficio ordini)
// e si chiude con il report. Usa il modello Assistenza (già nel calendario) con il campo `tipo`. Modulo puro.

export const TIPI_INTERVENTO = [
  { chiave: "FINE_POSA", nome: "Fine posa", emoji: "🔧" },
  { chiave: "MANUTENZIONE", nome: "Manutenzione", emoji: "🧰" },
  { chiave: "SOPRALLUOGO", nome: "Sopralluogo", emoji: "🔎" },
  { chiave: "SECONDO_RILIEVO", nome: "Secondo rilievo", emoji: "📏" },
  { chiave: "ASSISTENZA", nome: "Assistenza", emoji: "🛟" },
  { chiave: "ALTRO", nome: "Altro", emoji: "📌" },
] as const;

export type TipoIntervento = (typeof TIPI_INTERVENTO)[number]["chiave"];

export const tipoValido = (t: string | null | undefined): TipoIntervento =>
  (TIPI_INTERVENTO.find((x) => x.chiave === t)?.chiave ?? "ASSISTENZA") as TipoIntervento;

export const nomeIntervento = (t: string | null | undefined) => {
  const x = TIPI_INTERVENTO.find((y) => y.chiave === t) ?? TIPI_INTERVENTO[4];
  return `${x.emoji} ${x.nome}`;
};

/** Stati di un intervento ancora da fare. */
export const STATI_APERTI = ["APERTA", "PROGRAMMATA", "IN_ATTESA_RICAMBIO"];
export const eAperto = (stato: string) => STATI_APERTI.includes(stato);

/** C'è un intervento di fine posa ancora da fare: nel percorso la pratica resta al passo «Posa e fine lavori». */
export function finePosaAperta(interventi: { tipo: string; stato: string }[]): boolean {
  return interventi.some((i) => i.tipo === "FINE_POSA" && eAperto(i.stato));
}

/**
 * Cosa succede alla chiusura: un intervento di fine posa chiuso con «lavoro finito» porta la pratica a lavori eseguiti
 * (recensione e kit come una posa finita), se nessun altro intervento di fine posa è ancora aperto.
 */
export function chiusuraIntervento(i: { tipo: string; lavoroFinito: boolean }, altriAperti: { tipo: string; stato: string }[]): { lavoriEseguiti: boolean } {
  return { lavoriEseguiti: i.tipo === "FINE_POSA" && i.lavoroFinito && !finePosaAperta(altriAperti) };
}
