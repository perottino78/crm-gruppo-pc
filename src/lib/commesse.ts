export const STATI_COMMESSA: Record<string, { label: string; cls: string }> = {
  IN_ATTESA_ACCONTO: { label: "In attesa acconto", cls: "bg-amber-100 text-amber-900" },
  RILIEVO_DA_PROGRAMMARE: { label: "Rilievo da programmare", cls: "bg-blue-100 text-blue-900" },
  RILIEVO_PROGRAMMATO: { label: "Rilievo programmato", cls: "bg-indigo-100 text-indigo-900" },
  RILIEVO_ESEGUITO: { label: "Rilievo eseguito", cls: "bg-green-100 text-green-900" },
  ORDINI: { label: "Ordini fornitore", cls: "bg-purple-100 text-purple-900" },
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
