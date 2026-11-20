// Dove porta un task di pratica (richiesta di Ugo 20/11/2026): il task del rilievo ha «📏 Carica il rilievo» che apre il progetto
// dove si caricano misure, PDF/foto e materiale; quello dell'ufficio ordini apre materiale e ordini. Modulo puro (test in tests/pratica/link-task.test.ts).

const AZIONI: Record<string, { passo: string; ancora: string; testo: string }> = {
  RILIEVO: { passo: "RILIEVO", ancora: "rilievo", testo: "📏 Carica il rilievo" },
  ORDINI: { passo: "MATERIALE", ancora: "evasione", testo: "📦 Materiale e ordini" },
};

/** Link alla pratica nel punto giusto per la fase del task (senza fase: in cima alla pratica). */
export function linkTask(commessaId: string, faseChiave: string | null): string {
  const a = faseChiave ? AZIONI[faseChiave] : undefined;
  return `/commesse/${commessaId}${a ? `?passo=${a.passo}#${a.ancora}` : ""}`;
}

/** Testo del pulsante d'azione del task, se la sua fase ne ha uno. */
export const azioneTask = (faseChiave: string | null) => (faseChiave ? AZIONI[faseChiave]?.testo ?? null : null);
