// Normalizzazione dei nomi di luogo (modulo piccolo, anche per il browser): minuscolo, senza accenti né segni.
export const normalizza = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’'`´]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
