// Foto dei pannelli decorativi (Modello 13-24, 37-75), dei maniglioni WALA, delle maniglie, della buca delle lettere e dello spioncino dei
// portoncini PVC (richiesta di Ugo, 17/11/2026, dalle tavole del fornitore). Modulo puro: nome dell'optional → foto.
// Mancano ancora le foto dei pannelli 01-12 e 25-36.
export const PANNELLI_CON_FOTO: number[] = [...range(13, 24), ...range(37, 75)];
function range(a: number, b: number) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }

const MANIGLIONI = ["p1", "p5", "p8", "p10", "p10b", "p60", "p45b", "m1", "m2", "m6", "p45"];

/** Foto dell'optional dal suo nome, o null se non c'è. */
export function fotoOptionalPortoncino(categoria: string, nome: string): string | null {
  if (categoria === "PANNELLO DECORATIVO") {
    const m = /Modello\s+(\d{1,2})\b/.exec(nome);
    const n = m ? Number(m[1]) : NaN;
    return PANNELLI_CON_FOTO.includes(n) ? `/immagini/portoncini-pvc/pannelli/modello-${String(n).padStart(2, "0")}.jpg` : null;
  }
  if (categoria === "MANIGLIONE") {
    const m = /WALA\s+(\w+)/i.exec(nome);
    const k = m?.[1].toLowerCase();
    return k && MANIGLIONI.includes(k) ? `/immagini/portoncini-pvc/maniglie/wala-${k}.png` : null;
  }
  if (categoria === "MANIGLIA") {
    if (/antieffrazione/i.test(nome)) return "/immagini/portoncini-pvc/maniglie/maniglia-antieffrazione.png";
    if (/inox/i.test(nome)) return "/immagini/portoncini-pvc/maniglie/maniglia-inox.png";
    return "/immagini/portoncini-pvc/maniglie/maniglia-standard.png";
  }
  if (categoria === "ACCESSORI") {
    if (/buca/i.test(nome)) return "/immagini/portoncini-pvc/maniglie/buca-lettere.png";
    if (/spioncino/i.test(nome)) return "/immagini/portoncini-pvc/maniglie/spioncino.png";
  }
  return null;
}
