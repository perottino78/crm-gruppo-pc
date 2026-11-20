// Calcolatore finanziamento (come il simulatore Deutsche Bank, prodotto «Casa grandi interventi»). Funzioni pure, senza database.
// Le regole sono lette dalle formule del foglio «SIMULATORE_.xlsx» (fogli calcoli e sviluppo p. amm.to) e controllate ricalcolando il foglio.

export type DatiFinanziamento = {
  importo: number; // importo finanziato
  tanPercentuale: number; // TAN annuo al cliente, es. 6.99
  rate: number; // numero di rate
  mesiPrimaRata: number; // 1 = prima rata a 30 giorni, 3 = a 90 giorni
  speseIncassoRata?: number; // € per rata (nel foglio 1,5 sulle tabelle a 90 giorni, 0 sulle promo)
};

export const arrotondaCent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const perEccesso = (n: number, passo: number) => Math.ceil(n / passo - 1e-9) * passo;
const troncaa5 = (n: number) => Math.trunc(n * 1e5) / 1e5;

/** Rata a tasso zero: importo/rate per eccesso al centesimo; altrimenti PMT (vedi `rataBase`). */
export function rataMensile(importo: number, tanPercentuale: number, rate: number): number {
  const r = tanPercentuale / 100 / 12;
  if (rate <= 0) return 0;
  if (r === 0) return arrotondaCent(perEccesso(importo / rate, 0.01));
  return arrotondaCent(perEccesso((importo * r) / (1 - Math.pow(1 + r, -rate)), 0.01));
}

/** Rata come la arrotonda il foglio: tasso zero al centesimo; con TAN minore del tasso di riferimento ai 50 centesimi, altrimenti all'euro. */
export function rataBase(d: DatiFinanziamento, tassoRiferimento: number): number {
  if (d.rate <= 0) return 0;
  if (d.tanPercentuale === 0) return rataMensile(d.importo, 0, d.rate);
  const r = d.tanPercentuale / 100 / 12;
  const pmt = troncaa5((d.importo * r) / (1 - Math.pow(1 + r, -d.rate)));
  return d.tanPercentuale < tassoRiferimento ? perEccesso(pmt, 0.5) : perEccesso(pmt, 1);
}

/** Tasso interno (mensile) di una serie di flussi (il primo positivo, gli altri negativi), per bisezione. */
export function tassoInterno(flussi: number[]): number {
  const van = (r: number) => flussi.reduce((s, f, i) => s + f / Math.pow(1 + r, i), 0);
  let a = -0.99, b = 1;
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (van(a) * van(m) <= 0) b = m; else a = m;
  }
  return (a + b) / 2;
}

/** TAN effettivo (%) come lo calcola il foglio: tasso interno × 12 di importo contro rate mensili senza dilazione. */
function tanEffettivo(importo: number, rata: number, rate: number): number {
  const f = [importo, ...Array(rate).fill(-rata)];
  return tassoInterno(f) * 12;
}

export const SPESE_INCASSO_RATA = 1.5; // di partenza, se la tabella non lo dice
const RENDICONTAZIONE_ANNUA = 1;
const BOLLO_PRIMA_RATA = 16;
const BOLLO_ANNUO = 2;
const BOLLO_MASSIMO = 25;

/** Spese oltre la rata (incasso, rendicontazione annuale, bollo) alla rata k (1, 2, …). */
function speseDellaRata(k: number, bolloFinora: number, incassoRata: number): { spese: number; bollo: number } {
  let spese = incassoRata, bollo = 0;
  if (k === 1) bollo += BOLLO_PRIMA_RATA;
  if (k % 12 === 0) { spese += RENDICONTAZIONE_ANNUA; bollo += BOLLO_ANNUO; }
  bollo = Math.max(0, Math.min(bollo, BOLLO_MASSIMO - bolloFinora));
  return { spese: arrotondaCent(spese + bollo), bollo };
}

export type PianoFinanziamento = {
  rata: number; // rata di ammortamento
  interessiDifferimento: number; // interessi per la prima rata dilazionata, spalmati su ogni rata
  rataTotale: number; // rata + interessi di differimento
  totaleDovuto: number; // somma di tutto ciò che paga il cliente (rate, spese, bollo)
  tanEffettivo: number; // %
  taeg: number; // %
};

export function pianoFinanziamento(d: DatiFinanziamento, tassoRiferimento: number): PianoFinanziamento {
  const rata = rataBase(d, tassoRiferimento);
  const tanEff = d.tanPercentuale === 0 ? 0 : tanEffettivo(d.importo, rata, d.rate);
  const mesiDifferimento = Math.max(0, d.mesiPrimaRata - 1);
  const interessiDifferimento = arrotondaCent((d.importo * tanEff * mesiDifferimento) / (12 * d.rate));
  const rataTotale = arrotondaCent(rata + interessiDifferimento);
  const flussi: number[] = Array(d.mesiPrimaRata + d.rate).fill(0);
  flussi[0] = d.importo;
  let totale = 0, bolloFinora = 0;
  for (let k = 1; k <= d.rate; k++) {
    const { spese, bollo } = speseDellaRata(k, bolloFinora, d.speseIncassoRata ?? SPESE_INCASSO_RATA);
    bolloFinora += bollo;
    const pagato = rataTotale + spese;
    totale += pagato;
    flussi[d.mesiPrimaRata + k - 1] -= pagato;
  }
  const rm = tassoInterno(flussi);
  const taeg = Math.ceil((Math.pow(1 + rm, 12) - 1) * 10000 - 1e-9) / 100;
  return { rata, interessiDifferimento, rataTotale, totaleDovuto: arrotondaCent(totale), tanEffettivo: Math.round(tanEff * 10000) / 100, taeg };
}

/**
 * Contributo che trattiene la finanziaria (costo per P&C) e netto che ci arriva, come il foglio:
 * - TAN zero: importo meno il valore attuale delle rate al tasso di rendimento, più il valore attuale degli interessi di differimento;
 * - TAN con rendimento più alto del TAN: importo meno il valore attuale delle rate (arrotondate ai 50 centesimi) al tasso di rendimento;
 * - TAN pari o sopra il rendimento: nessun contributo.
 */
export function contributoENetto(d: DatiFinanziamento, tassoRendimento: number) {
  const r = tassoRendimento / 100 / 12;
  const rendita = (rata: number) => (r === 0 ? rata * d.rate : (rata * (1 - Math.pow(1 + r, -d.rate))) / r);
  let contributo = 0;
  if (d.tanPercentuale === 0) {
    const rata = perEccesso(d.importo / d.rate, 0.01);
    const mesiExtra = Math.max(0, d.mesiPrimaRata - 1);
    const procPerRata = (d.importo * (tassoRendimento / 100) * mesiExtra) / (12 * d.rate);
    const vapProc = r === 0 ? 0 : (procPerRata * (1 - Math.pow(1 + r, -d.rate))) / r / (1 + (tassoRendimento / 100) * (mesiExtra / 12));
    contributo = r === 0 ? 0 : d.importo - rendita(rata) + vapProc;
  } else if (tassoRendimento > d.tanPercentuale) {
    const rt = d.tanPercentuale / 100 / 12;
    const rata = perEccesso((d.importo * rt) / (1 - Math.pow(1 + rt, -d.rate)), 0.5);
    contributo = d.importo - rendita(rata);
  }
  contributo = arrotondaCent(Math.max(0, contributo));
  return { contributo, nettoErogato: arrotondaCent(d.importo - contributo) };
}

/** Compatibilità con le vecchie chiamate: TAEG dalla rata e dalle spese del piano. */
export function taeg(d: DatiFinanziamento, tassoRiferimento = d.tanPercentuale): number {
  return pianoFinanziamento(d, tassoRiferimento).taeg;
}
