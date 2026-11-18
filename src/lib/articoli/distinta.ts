// Distinta base (kit) di un articolo: costo e prezzo del kit dai suoi pezzi. Logica pura, testata in tests/articoli/distinta.test.ts.
const r2 = (n: number) => Math.round(n * 100) / 100;

export type PezzoKit = { quantita: number; costo: number | null; vendita: number | null };

/** Costo e prezzo di vendita del kit = somma di quantità × valore dei pezzi. `senzaCosto`/`senzaPrezzo` contano i pezzi a cui manca il dato. */
export function totaliDistinta(pezzi: PezzoKit[]) {
  let costo = 0, vendita = 0, senzaCosto = 0, senzaPrezzo = 0;
  for (const p of pezzi) {
    const q = p.quantita > 0 ? p.quantita : 0;
    if (p.costo === null) senzaCosto++; else costo += q * p.costo;
    if (p.vendita === null) senzaPrezzo++; else vendita += q * p.vendita;
  }
  return { costo: pezzi.length ? r2(costo) : null, vendita: pezzi.length ? r2(vendita) : null, senzaCosto, senzaPrezzo };
}

/** Un kit non può contenere se stesso, né direttamente né attraverso un altro kit: `figliDi` dà i pezzi di un articolo. */
export function creaCiclo(padre: string, nuovo: string, figliDi: (id: string) => string[]): boolean {
  if (padre === nuovo) return true;
  const visti = new Set<string>();
  const pila = [nuovo];
  while (pila.length) {
    const x = pila.pop()!;
    if (x === padre) return true;
    if (visti.has(x)) continue;
    visti.add(x);
    pila.push(...figliDi(x));
  }
  return false;
}
