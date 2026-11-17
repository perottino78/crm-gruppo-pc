// Visibilità dei listini/categorie dell'anagrafica articoli (richiesta di Ugo, 18/11/2026: ricambi di vetrate e pergole visibili solo a chi serve).
// Una categoria ha `visibileA` = elenco di ruoli («RUOLO:TECNICO») e uffici («UFFICIO:MAGAZZINO»); vuoto = tutti quelli che hanno accesso agli articoli.
// Chi può modificare gli articoli (listini.modifica) vede sempre tutto. Modulo puro.

export const RUOLI_VISIBILITA = [
  { chiave: "RUOLO:AMMINISTRATIVO", nome: "Amministrativi" },
  { chiave: "RUOLO:COMMERCIALE", nome: "Commerciali" },
  { chiave: "RUOLO:TELEFONISTA", nome: "Telefoniste" },
  { chiave: "RUOLO:MARKETING", nome: "Marketing" },
  { chiave: "RUOLO:TECNICO", nome: "Tecnici" },
  { chiave: "RUOLO:POSATORE", nome: "Posatori" },
];
export const UFFICI_VISIBILITA = [
  { chiave: "UFFICIO:COMMERCIALE", nome: "Ufficio commerciale" },
  { chiave: "UFFICIO:FATTURAZIONE", nome: "Fatturazione" },
  { chiave: "UFFICIO:TECNICO", nome: "Ufficio tecnico" },
  { chiave: "UFFICIO:ORDINI", nome: "Ufficio ordini" },
  { chiave: "UFFICIO:MAGAZZINO", nome: "Magazzino" },
  { chiave: "UFFICIO:POSA", nome: "Squadre di posa" },
  { chiave: "UFFICIO:AMMINISTRAZIONE", nome: "Amministrazione" },
  { chiave: "UFFICIO:CENTRALINO", nome: "Centralino" },
];
export const TOKEN_VALIDI = new Set([...RUOLI_VISIBILITA, ...UFFICI_VISIBILITA].map((x) => x.chiave));

/** Token della persona: il suo ruolo e il suo ufficio. */
export const tokenDi = (u: { ruolo?: string | null; ufficio?: string | null }): string[] => [u.ruolo ? `RUOLO:${u.ruolo}` : "", u.ufficio ? `UFFICIO:${u.ufficio}` : ""].filter(Boolean);

/** La categoria è visibile alla persona? (vuoto = tutti) */
export function categoriaVisibile(visibileA: string[] | null | undefined, u: { ruolo?: string | null; ufficio?: string | null }): boolean {
  if (!visibileA || visibileA.length === 0) return true;
  const mie = tokenDi(u);
  return visibileA.some((t) => mie.includes(t));
}

/** Testo breve per le liste: «Tutti» o l'elenco dei nomi. */
export function testoVisibilita(visibileA: string[] | null | undefined): string {
  if (!visibileA || visibileA.length === 0) return "Tutti";
  const nomi = [...RUOLI_VISIBILITA, ...UFFICI_VISIBILITA];
  return visibileA.map((t) => nomi.find((x) => x.chiave === t)?.nome ?? t).join(", ");
}

/** Tiene solo i token ammessi (dal modulo). */
export const pulisciToken = (lista: string[]): string[] => [...new Set(lista.filter((t) => TOKEN_VALIDI.has(t)))];
