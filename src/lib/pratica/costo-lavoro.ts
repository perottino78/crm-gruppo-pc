// Costo dell'operatore per una fase della pratica: minuti impiegati × costo orario / 60 (funzioni pure, testate).

/** Costo al minuto (€/min) dato il costo orario (€/h). */
export const costoAlMinuto = (costoOrario: number): number => (Number.isFinite(costoOrario) && costoOrario > 0 ? costoOrario / 60 : 0);

/** Costo del lavoro in € (ai centesimi): minuti × costo orario / 60. Valori non validi = 0. */
export function costoLavoro(minuti: number | null | undefined, costoOrario: number | null | undefined): number {
  if (!minuti || !costoOrario || minuti <= 0 || costoOrario <= 0) return 0;
  return Math.round((minuti * costoOrario) / 60 * 100) / 100;
}

/** «1 h 15 min» / «45 min» */
export function durataLeggibile(minuti: number): string {
  const m = Math.max(0, Math.round(minuti));
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} h${r ? ` ${r} min` : ""}` : `${r} min`;
}

/** Legge un numero scritto all'italiana («33,5») dal modulo; vuoto o non valido = null. */
export function numeroIt(v: FormDataEntryValue | null | undefined): number | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
