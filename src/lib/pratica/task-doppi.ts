// Un solo passaggio per ogni fase (Ugo 22/11/2026: «una per ogni avanzamento e basta»): se per la stessa fase ci sono più task, si tiene
// quello aperto più avanti (con costo o «in corso»), altrimenti il più vecchio aperto, altrimenti l'ultimo chiuso. Modulo puro (test in tests/pratica).

export type TaskDoppio = { id: string; faseChiave: string | null; stato: string; completatoIl: Date | null; createdAt: Date; costoLavoro?: number | null };

const aperto = (t: TaskDoppio, chiusi: string[]) => !t.completatoIl && !chiusi.includes(t.stato);

export function scegliTaskDoppi<T extends TaskDoppio>(tasks: T[], chiusi: string[]): { tieni: T[]; doppi: T[] } {
  const perFase = new Map<string, T[]>();
  const senzaFase: T[] = [];
  for (const t of tasks) (t.faseChiave ? (perFase.get(t.faseChiave) ?? perFase.set(t.faseChiave, []).get(t.faseChiave)!) : senzaFase).push(t);
  const tieni: T[] = [...senzaFase];
  const doppi: T[] = [];
  for (const gruppo of perFase.values()) {
    const ordinati = [...gruppo].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const aperti = ordinati.filter((t) => aperto(t, chiusi));
    let scelto: T;
    if (aperti.length) scelto = aperti.find((t) => (t.costoLavoro ?? 0) > 0) ?? aperti.find((t) => t.stato === "IN_CORSO") ?? aperti[0];
    else scelto = ordinati[ordinati.length - 1];
    tieni.push(scelto);
    // i doppioni ancora aperti si annullano; quelli già chiusi restano nella storia ma non si mostrano due volte
    for (const t of ordinati) if (t !== scelto) doppi.push(t);
  }
  return { tieni, doppi };
}
