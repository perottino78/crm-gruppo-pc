// Password provvisoria per gli inviti (solo lato server). Testata in tests/comunicazioni/comunicazioni.test.ts.
import { randomInt } from "crypto";

/** Password provvisoria facile da dettare: niente lettere che si confondono (l/1, O/0). */
export function passwordProvvisoria(): string {
  const lettere = "abcdefghjkmnpqrstuvwxyz", cifre = "23456789";
  const pezzo = (alfabeto: string, n: number) => Array.from({ length: n }, () => alfabeto[randomInt(alfabeto.length)]).join("");
  return `Pec-${pezzo(lettere, 4)}${pezzo(cifre, 2)}`;
}
