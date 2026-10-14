import type { Logger } from "./types";

// Logger a minimo contenuto: solo codici evento e contatori. Chiavi sospette vengono scartate,
// i valori stringa lunghi vengono troncati. Mai token, segreti, firme, dati personali.
const FORBIDDEN = /token|secret|signature|firma|password|email|telefono|phone|name|nome|challenge/i;

export const consoleLogger: Logger = (code, meta) => {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(meta ?? {})) {
    if (FORBIDDEN.test(k) || v === undefined) continue;
    safe[k] = typeof v === "string" ? v.slice(0, 80) : v;
  }
  console.log(JSON.stringify({ evt: "meta", code, ...safe }));
};
