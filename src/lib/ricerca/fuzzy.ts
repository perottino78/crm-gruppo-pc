// Ricerca «che perdona gli errori» (richiesta di Rocco): se si sbaglia una o due lettere del nome («Rosi Mraio») si trova lo
// stesso «Rossi Mario». Si usa quando la ricerca esatta trova poco. Funzioni pure, testate in tests/ricerca/fuzzy.test.ts.

export const normalizzaRicerca = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const parole = (s: string) => normalizzaRicerca(s).split(/[^a-z0-9@.]+/).filter(Boolean);

/** Distanza di Damerau-Levenshtein (scambio di due lettere vicine = 1 errore). */
export function distanza(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** Errori ammessi in una parola: nessuno fino a 3 lettere, 1 con 4-5, 2 da 6 in su. */
const tolleranza = (n: number) => (n < 4 ? 0 : n <= 5 ? 1 : 2);

/** Quanto una parola cercata somiglia a una parola del testo (1 = uguale, 0 = per niente); vale anche l'inizio della parola. */
function somiglianza(q: string, w: string): number {
  if (w.startsWith(q)) return 1;
  const intera = distanza(q, w);
  const inizio = w.length > q.length ? distanza(q, w.slice(0, q.length)) : intera;
  const err = Math.min(intera, inizio);
  return err <= tolleranza(q.length) ? 1 - err / Math.max(q.length, 1) : 0;
}

/** Punteggio di un testo per la ricerca: ogni parola cercata deve somigliare a una parola del testo (0 = non trovato). */
export function punteggio(ricerca: string, testo: string): number {
  const q = parole(ricerca), w = parole(testo);
  if (!q.length || !w.length) return 0;
  let tot = 0;
  for (const x of q) {
    const migliore = Math.max(...w.map((y) => somiglianza(x, y)));
    if (migliore <= 0) return 0;
    tot += migliore;
  }
  return tot / q.length;
}

/** Gli id dei più somiglianti (dal più vicino), esclusi quelli già trovati con la ricerca esatta. */
export function trovaSimili<T extends { id: string }>(ricerca: string, righe: T[], testo: (r: T) => string, max = 20, esclusi = new Set<string>()): string[] {
  // numeri (telefoni) e indirizzi email: niente approssimazione
  if (!/[a-z]{3,}/i.test(ricerca) || ricerca.includes("@")) return [];
  return righe
    .filter((r) => !esclusi.has(r.id))
    .map((r) => ({ id: r.id, p: punteggio(ricerca, testo(r)) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .slice(0, max)
    .map((x) => x.id);
}
