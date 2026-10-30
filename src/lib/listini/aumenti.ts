// Aumenti dei listini: il fornitore comunica una percentuale (es. +3,5%) e la si applica in un colpo
// alle griglie di prezzo dei modelli, agli optional a prezzo fisso del loro listino e agli articoli a pezzo.
// Funzioni pure: testabili senza database.

export type Arrotondamento = "CENTESIMI" | "MEZZO_EURO" | "EURO";
export const ARROTONDAMENTI: { chiave: Arrotondamento; nome: string }[] = [
  { chiave: "CENTESIMI", nome: "al centesimo" },
  { chiave: "MEZZO_EURO", nome: "ai 50 centesimi" },
  { chiave: "EURO", nome: "all'euro" },
];

/** "3,5" / "3.5" / "+3,5%" → 3.5. Accetta anche ribassi ("-2"). Fuori da ±50% è quasi certamente un errore. */
export function leggiPercentuale(s?: string | null): number | null {
  const t = (s ?? "").replace("%", "").replace(",", ".").replace(/\s+/g, "").replace(/^\+/, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 50) return null;
  return n;
}

export function arrotonda(v: number, a: Arrotondamento = "CENTESIMI"): number {
  const passo = a === "EURO" ? 1 : a === "MEZZO_EURO" ? 0.5 : 0.01;
  return Math.round(Math.round(v / passo) * passo * 100) / 100;
}

/** Nuovo prezzo dopo l'aumento. I prezzi a zero restano a zero. */
export function aumenta(valore: number, percentuale: number, a: Arrotondamento = "CENTESIMI"): number {
  if (!valore) return valore;
  return arrotonda(valore * (1 + percentuale / 100), a);
}

/** Gli optional in percentuale non si toccano: si calcolano già sul prezzo aumentato. */
export const optionalDaAumentare = (o: { tipoPrezzo: string }) => o.tipoPrezzo !== "PERCENTUALE";

/**
 * Codici "listino" degli optional che appartengono alle tipologie scelte. Un optional è del modello se il suo
 * campo listino è la tipologia stessa o il listino della tipologia (es. tutte le FRANGISOLE_* → FRANGISOLE_VERT).
 * Gli optional senza listino sono generali del marchio e restano fuori (valgono per modelli di fornitori diversi).
 */
export function listiniOptional(tipologie: string[], listinoDiTipologia: (t: string) => string | null): string[] {
  const s = new Set<string>();
  for (const t of tipologie) {
    s.add(t);
    const l = listinoDiTipologia(t);
    if (l) s.add(l);
  }
  return [...s];
}

/** Chiave di un listino (modello) nella selezione: marchio + tipologia. */
export const chiaveListino = (brandId: string, tipologia: string) => `${brandId}|${tipologia}`;
export function leggiChiaveListino(k: string): { brandId: string; tipologia: string } | null {
  const i = k.indexOf("|");
  return i > 0 ? { brandId: k.slice(0, i), tipologia: k.slice(i + 1) } : null;
}

export const testoPercentuale = (p: number) => `${p > 0 ? "+" : ""}${String(p).replace(".", ",")}%`;

/** Valori di prima, salvati con l'aumento per poterlo annullare: [tabella, id, valore]. */
export type ValorePrecedente = ["P" | "O" | "A", string, number | null, (number | null)?, (number | null)?];
