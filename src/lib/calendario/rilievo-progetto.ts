// Appuntamento di rilievo (SOPRALLUOGO) fissato dal calendario e collegato a un progetto del cliente (richiesta di Ugo 18/11/2026):
// collegandolo nasce il rilievo della pratica (stesso tecnico, stesso giorno e ora), così il rilievo si carica nel progetto con i suoi
// moduli. Nel calendario si vede una volta sola: il rilievo che doppia l'appuntamento collegato non si mostra.
// Modulo puro (testato in tests/calendario/rilievo-progetto.test.ts).

/** Stati della pratica in cui il progetto è chiuso: non si propone per il collegamento. */
export const STATI_PROGETTO_CHIUSO = ["CHIUSA", "ANNULLATA"];

const chiave = (commessaId: string, tecnicoId: string, dataOra: Date) => `${commessaId}|${tecnicoId}|${dataOra.getTime()}`;

/** Id dei rilievi che doppiano un appuntamento di rilievo collegato alla stessa pratica, stessa persona, stesso momento. */
export function rilieviDoppioni(
  appuntamenti: { tipo: string; commessaId: string | null; utenteId: string; dataOra: Date; stato: string }[],
  rilievi: { id: string; commessaId: string; tecnicoId: string; dataOra: Date }[],
): Set<string> {
  const app = new Set(
    appuntamenti.filter((a) => a.tipo === "SOPRALLUOGO" && a.commessaId && a.stato !== "ANNULLATO").map((a) => chiave(a.commessaId!, a.utenteId, a.dataOra)),
  );
  return new Set(rilievi.filter((r) => app.has(chiave(r.commessaId, r.tecnicoId, r.dataOra))).map((r) => r.id));
}

/** Link alla pratica per l'appuntamento: al rilievo se è un sopralluogo, altrimenti in cima. */
export const linkProgetto = (commessaId: string, tipo: string) => `/commesse/${commessaId}${tipo === "SOPRALLUOGO" ? "?passo=RILIEVO#rilievo" : ""}`;
