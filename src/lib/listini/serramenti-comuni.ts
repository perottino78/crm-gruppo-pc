// Voci comuni dei serramenti a listino (Zenith, Optima 70, Fidra, Plasma 30), richiesta di Ugo dopo la prova dei listini (16/11/2026):
// vetri speciali con il prezzo ad anta (finestre / portefinestre) e le lavorazioni a forma trapezoidale o curva (+40%, come «curvi o
// sagomati» dei listini Fidra e Plasma 30). I prezzi dei vetri sono stime di mercato (maggiorazione sul vetrocamera standard con
// ricarico P&C): da confermare con il fornitore. Modulo puro.

export type VoceOptional = { categoria: string; nome: string; tipoPrezzo: "FISSO" | "PERCENTUALE"; valore: number; unita: string | null; listino: string };

/** Vetri speciali per anta: [nome, prezzo finestra, prezzo portafinestra]. */
export const VETRI_SPECIALI: [string, number, number][] = [
  ["Vetro stratificato di sicurezza 3+3 lato interno (antinfortunio)", 70, 120],
  ["Vetro stratificato di sicurezza 3+3 sui due lati", 120, 200],
  ["Vetro antisfondamento 4+4 esterno + 3+3 interno (classe P2A)", 150, 260],
  ["Vetro insonorizzante acustico 3+3 / 5 (PVB acustico, fino a 42 dB)", 130, 220],
  ["Vetro decorativo stampato (es. Master Carré, Cincillà)", 90, 150],
];

/** Vetri speciali del listino: una voce per finestre (`<base>_F`) e una per portefinestre (`<base>_PF`). */
export function vetriSpeciali(base: string): VoceOptional[] {
  return VETRI_SPECIALI.flatMap(([nome, f, pf]) => [
    { categoria: "Vetri", nome: `${nome} (ad anta)`, tipoPrezzo: "FISSO" as const, valore: f, unita: "anta", listino: `${base}_F` },
    { categoria: "Vetri", nome: `${nome} (ad anta)`, tipoPrezzo: "FISSO" as const, valore: pf, unita: "anta", listino: `${base}_PF` },
  ]);
}

/** Forme speciali: trapezoidale e curva/ad arco, +40% come «curvi o sagomati» degli altri listini. */
export function formeSpeciali(base: string, conCurva = true): VoceOptional[] {
  return [
    { categoria: "Misure e lavorazioni", nome: "Forma trapezoidale (fuori squadro)", tipoPrezzo: "PERCENTUALE", valore: 40, unita: null, listino: base },
    ...(conCurva ? [{ categoria: "Misure e lavorazioni", nome: "Forma curva / ad arco (centinata)", tipoPrezzo: "PERCENTUALE" as const, valore: 40, unita: null, listino: base }] : []),
  ];
}

/**
 * Tendine dell'offerta: le voci dei listini a tendine si raggruppano così (richiesta di Ugo: «gli altri accessori insieme»).
 * Maniglie, ferramenta, traversi e pannelli vanno in «Accessori»; misure e lavorazioni in «Lavorazioni e misure».
 */
export function tendinaDi(categoria: string): string {
  if (["Maniglie e ferramenta", "Traversi e pannelli", "Accessorio", "Accessori"].includes(categoria)) return "Accessori";
  if (categoria === "Misure e lavorazioni") return "Lavorazioni e misure";
  return categoria;
}

/**
 * Le scelte dell'offerta da sapere al rilievo e nell'ordine (colore esterno/interno, vetri, accessori…), da aggiungere alla descrizione
 * della riga del materiale: «Colore esterno: Rovere gold (AP 23) — pellicola · Vetri: Vetro satinato (ad anta) ×2».
 */
export function sceltePerRilievo(optionali: { quantita: number; nota?: string | null; optional: { categoria: string; nome: string } }[]): string {
  return optionali
    .map((o) => `${o.optional.categoria}: ${o.optional.nome}${o.quantita > 1 ? ` ×${o.quantita}` : ""}${o.nota ? ` (${o.nota})` : ""}`)
    .join(" · ");
}
