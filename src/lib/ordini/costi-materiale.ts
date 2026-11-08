// Costo del materiale di una commessa (modulo puro, usato dalla scheda costi e dai report).
// Regola: il costo vero si conosce solo dalla conferma del fornitore o dalla fattura.
//  - ordine con «totale confermato» e senza fattura registrata → conta il totale confermato (le sue righe non si sommano);
//  - quando arriva la fattura di quell'ordine → contano i costi della fattura (righe e costi «fattura fornitore»);
//  - le altre righe contano con il loro costo reale, se inserito.
// Se è registrato il «totale acquisto materiali» (modo rapido) le righe e le conferme non si sommano, come prima.

export type RigaPerCosto = { descrizione: string; fornitoreNome: string | null; costoEffettivo: number | null; ordineFornitoreId: string | null; data: Date };
export type OrdinePerCosto = { id: string; numero: string; fornitoreNome: string; totaleConfermato: number | null; confermatoIl: Date | null; fatturato: boolean };
export type VoceMateriale = { data: Date; voce: string; tipo: string; importo: number };

export function vociMateriale(righe: RigaPerCosto[], ordini: OrdinePerCosto[], haTotaleAcquisti: boolean): { voci: VoceMateriale[]; righeSenzaCosto: number } {
  if (haTotaleAcquisti) return { voci: [], righeSenzaCosto: 0 };
  const confermati = ordini.filter((o) => o.totaleConfermato !== null && !o.fatturato);
  const idConfermati = new Set(confermati.map((o) => o.id));
  const libere = righe.filter((r) => !r.ordineFornitoreId || !idConfermati.has(r.ordineFornitoreId));
  const voci: VoceMateriale[] = [
    ...confermati.map((o) => ({ data: o.confermatoIl ?? new Date(0), voce: `Conferma ordine ${o.numero} — ${o.fornitoreNome}`, tipo: "Materiale (conferma fornitore)", importo: o.totaleConfermato ?? 0 })),
    ...libere.filter((r) => r.costoEffettivo !== null).map((r) => ({ data: r.data, voce: `${r.descrizione}${r.fornitoreNome ? " — " + r.fornitoreNome : ""}`, tipo: "Materiale", importo: r.costoEffettivo ?? 0 })),
  ];
  return { voci, righeSenzaCosto: libere.filter((r) => r.costoEffettivo === null).length };
}

/** Testo da cercare nel listino/articoli: tutte le parole, senza accenti né maiuscole. */
export function corrisponde(testo: string, ricerca: string): boolean {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = n(testo);
  return n(ricerca).split(/\s+/).filter(Boolean).every((p) => t.includes(p));
}
