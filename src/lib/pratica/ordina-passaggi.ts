// Ordine dei passaggi fra uffici nel riquadro «Avanzamento» della pratica (Debora 26/11/2026: «Fatturazione prima di Amministrazione,
// così seguiamo i passi in ordine»). Prima si ordinava per data di arrivo e l'incasso dell'acconto poteva comparire prima della
// fattura. Ora si segue la catena del flusso; i task senza fase (liberi) o di fasi sconosciute restano dove cade la loro data:
// subito dopo il passaggio della catena più vicino che li precede per data di arrivo (o in testa se non ce n'è). Modulo puro.

/** Catena del flusso, nell'ordine in cui lavorano gli uffici. */
export const CATENA_FASI = [
  "ACCETTAZIONE", "FATT_ACCONTO", "PROGETTO", "RILIEVO_APP", "RILIEVO", "ORDINI", "MAGAZZINO", "MATERIALE_COMPLETO", "FATT_SALDO", "POSA_APP", "POSA", "KIT",
] as const;

export function ordinaPassaggi<T extends { faseChiave?: string | null; createdAt: Date }>(task: T[], catena: readonly string[] = CATENA_FASI): T[] {
  const posto = (t: T) => (t.faseChiave ? catena.indexOf(t.faseChiave) : -1);
  const perData = (a: T, b: T) => a.createdAt.getTime() - b.createdAt.getTime();
  const incatena = task.filter((t) => posto(t) >= 0).sort((a, b) => posto(a) - posto(b) || perData(a, b));
  const liberi = task.filter((t) => posto(t) < 0).sort(perData);
  const inTesta: T[] = [];
  // dopo ogni passaggio della catena vanno i liberi che hanno lui come più vicino precedente per data
  const dopo = new Map<T, T[]>();
  for (const l of liberi) {
    let ancora: T | null = null;
    for (const c of incatena) if (c.createdAt.getTime() <= l.createdAt.getTime() && (!ancora || c.createdAt.getTime() >= ancora.createdAt.getTime())) ancora = c;
    if (!ancora) inTesta.push(l);
    else dopo.set(ancora, [...(dopo.get(ancora) ?? []), l]);
  }
  return [...inTesta, ...incatena.flatMap((t) => [t, ...(dopo.get(t) ?? [])])];
}
