// Dove compare un articolo nel listino delle offerte (richiesta di Ugo, 18/11/2026): la categoria dell'anagrafica ha una famiglia (Indoor/Outdoor…)
// e un gruppo del listino (VETRATE, PERGOLE…); le sottocategorie senza posizione usano quella della madre. Modulo puro.

export type CatPosizione = { id: string; padreId: string | null; famiglia: string | null; gruppoListino: string | null };

/** Posizione effettiva di una categoria: la sua, altrimenti quella della madre. */
export function posizioneEffettiva(id: string | null | undefined, cat: CatPosizione[]): { famiglia: string; gruppo: string | null } | null {
  let c = cat.find((x) => x.id === id);
  for (let i = 0; c && i < 5; i++) {
    if (c.famiglia) return { famiglia: c.famiglia, gruppo: c.gruppoListino || null };
    c = c.padreId ? cat.find((x) => x.id === c!.padreId) : undefined;
  }
  return null;
}

export const testoPosizione = (p: { famiglia: string; gruppo: string | null } | null): string => (p ? `${p.famiglia}${p.gruppo ? ` › ${p.gruppo}` : ""}` : "solo anagrafica (non compare nel listino)");

/** Id delle categorie che compaiono in una famiglia/gruppo: con gruppo vuoto quelle collegate alla sola famiglia. */
export function categorieDelListino(famiglia: string, gruppo: string | null, cat: CatPosizione[]): string[] {
  return cat.filter((c) => {
    const p = posizioneEffettiva(c.id, cat);
    return p && p.famiglia === famiglia && (gruppo ? p.gruppo === gruppo : !p.gruppo);
  }).map((c) => c.id);
}
