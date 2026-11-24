// IVA per singolo prodotto dell'offerta (Debora/Ugo 24/11/2026): ogni riga può avere la sua aliquota (null = quella dell'offerta);
// lo sconto dell'offerta si applica a tutte le righe e l'IVA si calcola per riga, così arriva uguale in fattura fino al saldo.

export type RigaIva = { importo: number; aliquota: number | null };

const cent = (n: number) => Math.round(n * 100) / 100;

/** Imponibile (già scontato) e IVA per aliquota, in ordine decrescente di aliquota. */
export function riepilogoIvaRighe(righe: RigaIva[], scontoPercentuale: number, aliquotaOfferta: number): { aliquota: number; imponibile: number; iva: number }[] {
  const per = new Map<number, number>();
  for (const r of righe) {
    const a = r.aliquota ?? aliquotaOfferta;
    per.set(a, (per.get(a) ?? 0) + r.importo * (1 - (scontoPercentuale || 0) / 100));
  }
  return [...per.entries()].sort((x, y) => y[0] - x[0]).map(([aliquota, imponibile]) => ({ aliquota, imponibile: cent(imponibile), iva: cent(imponibile * aliquota / 100) }));
}

/** Importo di una riga: quantità × prezzo + optional della riga + optional a voce. */
export const importoRigaOfferta = (r: { quantita: number; prezzoUnitario: number; optionalPrezzo: number; optionali?: { quantita: number; prezzoUnitario: number }[] }) =>
  r.quantita * r.prezzoUnitario + r.optionalPrezzo + (r.optionali ?? []).reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);

export const ALIQUOTE_RIGA = [22, 10, 4, 0];
