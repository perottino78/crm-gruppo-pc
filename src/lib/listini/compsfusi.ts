// Componenti struttura MV Living (profili, piantoni, agganci, piastre: tipologie COMPSFUSI_…): colori standard del fornitore.
// Dalla scheda del profilo L: «9010/1013 lucido, 9010/1013/7016/8017 soft, Corten». Di serie sullo stesso prezzo a misura del listino
// (Ugo 21/11/2026: «mancano i colori a tendina come sulle staffe a ragno»); se un colore avesse un sovrapprezzo si corregge a mano nel listino.
export const PREFISSO_COMPSFUSI = "COMPSFUSI_";

export const COLORI_COMPSFUSI = [
  "Bianco 9010 lucido",
  "Avorio 1013 lucido",
  "Bianco 9010 soft",
  "Avorio 1013 soft",
  "Grigio antracite 7016 soft",
  "Marrone 8017 soft",
  "Corten",
] as const;

/** Colore che c'era prima (unico): resta, così le offerte e le pratiche già fatte continuano a funzionare. */
export const COLORE_VECCHIO_COMPSFUSI = "STANDARD";

type Riga = { tipologia: string; colore: string; altezzaMm: number; larghezzaMm: number; prezzoBase: number; coefficienteRicarico: number | null };
const chiave = (r: Pick<Riga, "tipologia" | "colore" | "altezzaMm" | "larghezzaMm">) => `${r.tipologia}|${r.colore}|${r.altezzaMm}|${r.larghezzaMm}`;

/** Le righe di colore che mancano: per ogni misura «STANDARD» una riga per colore, con lo stesso prezzo. */
export function righeColoriMancanti(esistenti: Riga[]): Riga[] {
  const gia = new Set(esistenti.map(chiave));
  const nuove: Riga[] = [];
  for (const r of esistenti) {
    if (r.colore !== COLORE_VECCHIO_COMPSFUSI || !r.tipologia.startsWith(PREFISSO_COMPSFUSI)) continue;
    for (const colore of COLORI_COMPSFUSI) {
      const n = { ...r, colore };
      if (gia.has(chiave(n))) continue;
      gia.add(chiave(n));
      nuove.push(n);
    }
  }
  return nuove;
}
