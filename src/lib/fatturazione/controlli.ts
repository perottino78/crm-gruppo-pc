// Controlli formali sui dati del cliente PRIMA di emettere: lo SDI scarta il file se partita IVA o codice fiscale
// non tornano (errori 00305 e 00306) e un codice destinatario sbagliato manda la fattura nel vuoto.

/** Partita IVA italiana: 11 cifre con cifra di controllo. */
export function pivaValida(valore: string): boolean {
  const s = valore.replace(/\s/g, "").replace(/^IT/i, "");
  if (!/^\d{11}$/.test(s)) return false;
  let somma = 0;
  for (let i = 0; i < 10; i++) {
    let c = Number(s[i]);
    if (i % 2 === 1) { c *= 2; if (c > 9) c -= 9; }
    somma += c;
  }
  return (10 - (somma % 10)) % 10 === Number(s[10]);
}

const DISPARI: Record<string, number> = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

/** Codice fiscale: 16 caratteri di persona fisica con lettera di controllo, oppure 11 cifre (società) come la partita IVA. */
export function codiceFiscaleValido(valore: string): boolean {
  const s = valore.replace(/\s/g, "").toUpperCase();
  if (/^\d{11}$/.test(s)) return pivaValida(s);
  if (!/^[A-Z0-9]{16}$/.test(s)) return false;
  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const c = s[i];
    if (i % 2 === 0) somma += DISPARI[c] ?? -1000;
    else somma += /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
  }
  return String.fromCharCode(65 + (somma % 26)) === s[15];
}

/** Codice destinatario: 7 caratteri (6 sono degli enti pubblici, che vogliono un altro formato di file). Vuoto = 0000000. */
export function erroreCodiceDestinatario(valore: string | null | undefined): string | null {
  const s = (valore ?? "").trim();
  if (!s) return null;
  if (s.length === 6) return "Il codice destinatario ha 6 caratteri: è di un ente pubblico, che richiede un formato di fattura diverso (non ancora previsto).";
  if (!/^[A-Za-z0-9]{7}$/.test(s)) return "Il codice destinatario del cliente deve avere 7 caratteri (lettere e cifre).";
  return null;
}

export const pecValida = (valore: string | null | undefined): boolean => !valore || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valore.trim());
