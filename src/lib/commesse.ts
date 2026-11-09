export const STATI_COMMESSA: Record<string, { label: string; cls: string }> = {
  IN_ATTESA_ACCONTO: { label: "In attesa acconto", cls: "bg-amber-100 text-amber-900" },
  RILIEVO_DA_PROGRAMMARE: { label: "Rilievo da programmare", cls: "bg-blue-100 text-blue-900" },
  RILIEVO_PROGRAMMATO: { label: "Rilievo programmato", cls: "bg-indigo-100 text-indigo-900" },
  RILIEVO_ESEGUITO: { label: "Rilievo eseguito", cls: "bg-green-100 text-green-900" },
  ORDINI: { label: "Ordini fornitore", cls: "bg-purple-100 text-purple-900" },
  SALDO_INCASSATO: { label: "Saldo incassato", cls: "bg-lime-100 text-lime-900" },
  POSA: { label: "Posa", cls: "bg-teal-100 text-teal-900" },
  LAVORI_ESEGUITI: { label: "Lavori eseguiti", cls: "bg-emerald-100 text-emerald-900" },
  CHIUSA: { label: "Chiusa", cls: "bg-neutral-200 text-neutral-800" },
  ANNULLATA: { label: "Annullata", cls: "bg-red-100 text-red-900" },
};

export function numeroCommessa(c: { numero: number; anno: number }) {
  return `C${c.anno}-${String(c.numero).padStart(3, "0")}`;
}

export const eur = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

/** Consegna prevista del progetto: testo e colore (rossa se scaduta e il lavoro non è finito, arancione se entro 7 giorni). */
export function statoConsegna(consegna: Date | null | undefined, stato: string, oggi = new Date()): { testo: string; cls: string } {
  if (!consegna) return { testo: "—", cls: "text-neutral-400" };
  const testo = consegna.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "2-digit" });
  if (["LAVORI_ESEGUITI", "CHIUSA", "ANNULLATA"].includes(stato)) return { testo, cls: "text-neutral-700" };
  const giorni = Math.floor((consegna.getTime() - oggi.getTime()) / 86400000);
  if (giorni < 0) return { testo: `${testo} · scaduta`, cls: "text-red-700 font-bold" };
  if (giorni <= 7) return { testo, cls: "text-amber-700 font-bold" };
  return { testo, cls: "text-green-800" };
}
