/** Percentuale all'italiana con fino a 5 decimali, senza zeri inutili (12,34567 · 10 · 7,5). */
export const percentuale = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 5 });
