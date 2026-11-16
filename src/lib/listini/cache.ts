// Memoria breve per i dati di listino che ogni pagina dell'offerta e della pratica rilegge a ogni salvataggio automatico
// (albero dei prodotti e optional del marchio: migliaia di righe). Senza memoria erano la lettura più pesante del database
// (traffico di Neon, nov 2026). Vale per l'istanza del server che risponde: 5 minuti al massimo, e chi cambia il listino
// da P&C ONE (aumenti, scheda del modello, prezzi) la svuota subito con svuotaCacheListino().
const DURATA_MS = 5 * 60_000;
const memoria = new Map<string, { scade: number; valore: Promise<unknown> }>();

export function inMemoriaListino<T>(chiave: string, calcola: () => Promise<T>): Promise<T> {
  const ora = Date.now();
  const c = memoria.get(chiave);
  if (c && c.scade > ora) return c.valore as Promise<T>;
  const valore = calcola();
  memoria.set(chiave, { scade: ora + DURATA_MS, valore });
  // un errore non resta in memoria
  valore.catch(() => memoria.delete(chiave));
  return valore;
}

export function svuotaCacheListino() {
  memoria.clear();
}
