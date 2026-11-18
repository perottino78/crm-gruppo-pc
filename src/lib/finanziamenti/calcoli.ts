// Calcolatore finanziamento (come il simulatore Deutsche Bank). Funzioni pure, senza database.

export type DatiFinanziamento = {
  importo: number; // importo finanziato
  tanPercentuale: number; // TAN annuo, es. 6.99
  rate: number; // numero di rate
  mesiPrimaRata: number; // mesi di dilazione prima della prima rata (es. 3 = 90 giorni)
  speseIncassoRata?: number; // € per rata (es. 2)
};

export const arrotondaCent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const perEccesso = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;

/** Rata di ammortamento: importo/rate a tasso zero, altrimenti PMT; arrotondata per eccesso al centesimo. */
export function rataMensile(importo: number, tanPercentuale: number, rate: number): number {
  const r = tanPercentuale / 100 / 12;
  if (rate <= 0) return 0;
  if (r === 0) return perEccesso(importo / rate);
  return perEccesso((importo * r) / (1 - Math.pow(1 + r, -rate)));
}

/** Interessi di differimento (mesi oltre il primo) spalmati sulle rate. */
export function interessiDifferimentoPerRata(d: DatiFinanziamento): number {
  const mesiExtra = Math.max(0, d.mesiPrimaRata - 1);
  return (d.importo * (d.tanPercentuale / 100) * mesiExtra) / (12 * d.rate);
}

/** Contributo del negoziante (costo per P&C) e netto erogato, come nel foglio: valore attuale di ciò che il cliente non paga. */
export function contributoENetto(d: DatiFinanziamento, tanTabella: number) {
  const r = tanTabella / 100 / 12;
  const rata = rataMensile(d.importo, d.tanPercentuale, d.rate);
  const pvRate = r === 0 ? rata * d.rate : (rata * (1 - Math.pow(1 + r, -d.rate))) / r;
  const mesiExtra = Math.max(0, d.mesiPrimaRata - 1);
  const procPerRata = (d.importo * (tanTabella / 100) * mesiExtra) / (12 * d.rate);
  const vapProc = r === 0 ? 0 : (procPerRata * (1 - Math.pow(1 + r, -d.rate))) / r / (1 + (tanTabella / 100) * (mesiExtra / 12));
  const contributo = arrotondaCent(d.importo - pvRate + vapProc);
  return { rata, contributo, nettoErogato: arrotondaCent(d.importo - contributo) };
}

/** Tasso interno (mensile) di una serie di flussi, per bisezione. */
export function tassoInterno(flussi: number[]): number {
  const van = (r: number) => flussi.reduce((s, f, i) => s + f / Math.pow(1 + r, i), 0);
  let a = -0.99, b = 1;
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (van(a) * van(m) <= 0) b = m; else a = m;
  }
  return (a + b) / 2;
}

/** TAEG annuo (%) dai flussi mensili: +importo al mese 0, poi rate (+spese) dopo `mesiPrimaRata`. */
export function taeg(d: DatiFinanziamento, rata: number): number {
  const spese = d.speseIncassoRata ?? 0;
  const flussi = Array(d.mesiPrimaRata + d.rate).fill(0);
  flussi[0] = d.importo;
  for (let k = 0; k < d.rate; k++) flussi[d.mesiPrimaRata + k] -= rata + spese;
  const rm = tassoInterno(flussi);
  return Math.round((Math.pow(1 + rm, 12) - 1) * 10000) / 100;
}
