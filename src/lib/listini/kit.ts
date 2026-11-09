// Distinta base (kit) dei modelli di listino: quanti pezzi di ogni componente servono per una riga venduta. Modulo puro.

export type CalcoloKit = "PEZZO" | "METRO" | "MQ" | "FISSO";
export const CALCOLI_KIT: { valore: CalcoloKit; label: string }[] = [
  { valore: "PEZZO", label: "per ogni pezzo venduto" },
  { valore: "METRO", label: "per metro di larghezza" },
  { valore: "MQ", label: "per m² (larghezza × altezza)" },
  { valore: "FISSO", label: "una volta per riga" },
];
export const labelCalcolo = (c: string) => CALCOLI_KIT.find((x) => x.valore === c)?.label ?? c;

/**
 * Quantità del componente per una riga: pezzi venduti, misure della riga (nell'unità del listino, mm o cm).
 * Arrotonda per eccesso al pezzo intero (le righe d'ordine sono a pezzi); senza misura il calcolo a metro/m² vale come «per pezzo».
 */
export function quantitaComponente(
  c: { quantita: number; calcolo: string },
  riga: { quantita: number; larghezza?: number | null; altezza?: number | null; unita?: "mm" | "cm" },
): number {
  const div = riga.unita === "cm" ? 100 : 1000;
  const L = riga.larghezza && riga.larghezza > 0 ? riga.larghezza / div : null;
  const H = riga.altezza && riga.altezza > 0 ? riga.altezza / div : null;
  const pezzi = Math.max(1, riga.quantita || 1);
  let q: number;
  if (c.calcolo === "FISSO") q = c.quantita;
  else if (c.calcolo === "METRO" && L) q = c.quantita * L * pezzi;
  else if (c.calcolo === "MQ" && L && H) q = c.quantita * L * H * pezzi;
  else q = c.quantita * pezzi;
  return Math.max(1, Math.ceil(Math.round(q * 1000) / 1000));
}
