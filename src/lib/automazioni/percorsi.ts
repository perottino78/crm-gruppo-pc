// Percorsi automatici del lead (Fase 1): per ogni esito, quali email/solleciti partono e quando.
// Ripresi dalla campagna Keap (acquisizione, In Target, Fuori Regione, Non risponde, Ricontatto, Non interessato).
// Ogni nuovo esito annulla le azioni future del ciclo precedente. Funzioni pure: testabili senza database.
import { chiusuraGiornata, dopoGiorniAlle08, scadenzaNuovoTentativo, stessaOraFra } from "./tempi";

export type Quando = { subito: true } | { dopoGiorni: number; conSabato?: boolean } | { daRichiamo: number };
export type Passo =
  | { tipo: "EMAIL"; modello: string; a: "CLIENTE" | "CENTRALINO"; variante?: string; quando: Quando; nome: string }
  | { tipo: "TIMEOUT"; quando: Quando; nome: string };

export const PERCORSI: Record<string, Passo[]> = {
  NUOVO: [{ tipo: "EMAIL", modello: "qualification-requested", a: "CENTRALINO", quando: { subito: true }, nome: "Avviso al centralino: da classificare" }],
  IN_TARGET: [
    { tipo: "EMAIL", modello: "request-received", a: "CLIENTE", quando: { subito: true }, nome: "Grazie per la richiesta (cliente)" },
    { tipo: "EMAIL", modello: "call-requested", variante: "initial-prequalification", a: "CENTRALINO", quando: { subito: true }, nome: "Da chiamare #1" },
    { tipo: "EMAIL", modello: "call-requested", variante: "initial-prequalification", a: "CENTRALINO", quando: { dopoGiorni: 1 }, nome: "Da chiamare #2" },
    { tipo: "EMAIL", modello: "call-requested", variante: "initial-prequalification", a: "CENTRALINO", quando: { dopoGiorni: 1 }, nome: "Da chiamare #3" },
    { tipo: "TIMEOUT", quando: { dopoGiorni: 20 }, nome: "Non gestito dopo 20 giorni" },
  ],
  FUORI_REGIONE: [{ tipo: "EMAIL", modello: "region-not-served", a: "CLIENTE", quando: { subito: true }, nome: "Regione non servita (cliente)" }],
  NON_RISPONDE: [
    { tipo: "EMAIL", modello: "call-unanswered-contact", a: "CLIENTE", quando: { subito: true }, nome: "Abbiamo provato a chiamarti (cliente)" },
    { tipo: "EMAIL", modello: "call-requested", variante: "call-unanswered-reminder", a: "CENTRALINO", quando: { dopoGiorni: 1 }, nome: "Richiama #1" },
    { tipo: "EMAIL", modello: "call-requested", variante: "call-unanswered-reminder", a: "CENTRALINO", quando: { dopoGiorni: 1 }, nome: "Richiama #2" },
    { tipo: "EMAIL", modello: "call-requested", variante: "call-unanswered-reminder", a: "CENTRALINO", quando: { dopoGiorni: 1 }, nome: "Richiama #3" },
    { tipo: "TIMEOUT", quando: { dopoGiorni: 20, conSabato: false }, nome: "Non gestito dopo 20 giorni" },
  ],
  DA_RICHIAMARE: [
    { tipo: "EMAIL", modello: "callback-confirmed", a: "CLIENTE", quando: { subito: true }, nome: "Ti ricontatteremo (cliente)" },
    { tipo: "EMAIL", modello: "call-requested", variante: "scheduled-first-contact", a: "CENTRALINO", quando: { daRichiamo: 0 }, nome: "Ricontatto: giorno R" },
    { tipo: "EMAIL", modello: "call-requested", variante: "scheduled-first-contact", a: "CENTRALINO", quando: { daRichiamo: 1 }, nome: "Ricontatto: R+1" },
    { tipo: "EMAIL", modello: "call-requested", variante: "scheduled-first-contact", a: "CENTRALINO", quando: { daRichiamo: 2 }, nome: "Ricontatto: R+2" },
    { tipo: "TIMEOUT", quando: { daRichiamo: 20 }, nome: "Non gestito dopo R+20" },
  ],
  NON_INTERESSATO: [{ tipo: "EMAIL", modello: "interest-closed", a: "CLIENTE", quando: { subito: true }, nome: "Restiamo in contatto (cliente)" }],
  // Fase 2: conferme, promemoria e lettere di vendita degli appuntamenti
  APPUNTAMENTO_CASA: [],
  APPUNTAMENTO_SHOWROOM: [],
  APPUNTAMENTO_ANNULLATO: [],
};

/** Quando eseguire un passo: `riferimento` è il momento in cui si è concluso il passo precedente (o l'esito). */
export function quandoPasso(q: Quando, riferimento: Date, richiamoIl?: Date | null): Date {
  if ("subito" in q) return riferimento;
  if ("dopoGiorni" in q) return dopoGiorniAlle08(riferimento, q.dopoGiorni, q.conSabato ?? true);
  if (!richiamoIl) throw new Error("Manca la data del ricontatto");
  return stessaOraFra(richiamoIl, q.daRichiamo);
}

// ---- Fasi ed esiti del lead ----

export const FASI_LEAD: Record<string, { nome: string; azione: string | null; chiusa?: boolean; colore: string }> = {
  NUOVO: { nome: "Da classificare", azione: "In target o Fuori regione?", colore: "bg-blue-100 text-blue-900" },
  IN_TARGET: { nome: "In target", azione: "Chiamata di prequalifica", colore: "bg-green-100 text-green-900" },
  NON_RISPONDE: { nome: "Non risponde", azione: "Nuovo tentativo di chiamata", colore: "bg-amber-100 text-amber-900" },
  DA_RICHIAMARE: { nome: "Da richiamare", azione: "Ricontatto concordato", colore: "bg-amber-100 text-amber-900" },
  APPUNTAMENTO_CASA: { nome: "Appuntamento a casa", azione: "Appuntamento fissato", colore: "bg-purple-100 text-purple-900" },
  APPUNTAMENTO_SHOWROOM: { nome: "Appuntamento in showroom", azione: "Appuntamento fissato", colore: "bg-purple-100 text-purple-900" },
  APPUNTAMENTO_ANNULLATO: { nome: "Appuntamento annullato", azione: "Definisci il seguito", colore: "bg-red-100 text-red-900" },
  NON_INTERESSATO: { nome: "Non interessato", azione: null, chiusa: true, colore: "bg-neutral-200 text-neutral-700" },
  FUORI_REGIONE: { nome: "Fuori regione", azione: null, chiusa: true, colore: "bg-neutral-200 text-neutral-700" },
  // valori dei lead registrati prima del nuovo percorso
  CONTATTATO: { nome: "Contattato", azione: "Chiamata di prequalifica", colore: "bg-green-100 text-green-900" },
  APPUNTAMENTO_FISSATO: { nome: "Appuntamento fissato", azione: "Appuntamento fissato", colore: "bg-purple-100 text-purple-900" },
};
export const FASI_APERTE = Object.entries(FASI_LEAD).filter(([, f]) => !f.chiusa).map(([k]) => k);

export const ESITI: Record<string, { nome: string; serveData?: "richiamo" | "appuntamento" }> = {
  IN_TARGET: { nome: "In target" },
  FUORI_REGIONE: { nome: "Fuori regione" },
  NON_RISPONDE: { nome: "Non risponde" },
  DA_RICHIAMARE: { nome: "Appuntamento da fissare (ricontatto)", serveData: "richiamo" },
  APPUNTAMENTO_CASA: { nome: "Appuntamento fissato a CASA", serveData: "appuntamento" },
  APPUNTAMENTO_SHOWROOM: { nome: "Appuntamento fissato in SHOWROOM", serveData: "appuntamento" },
  APPUNTAMENTO_ANNULLATO: { nome: "Appuntamento annullato" },
  NON_INTERESSATO: { nome: "Non interessato" },
};

const PREQUALIFICA = ["NON_RISPONDE", "DA_RICHIAMARE", "APPUNTAMENTO_CASA", "APPUNTAMENTO_SHOWROOM", "NON_INTERESSATO"];
/** Esiti che si possono registrare partendo da una fase (prima la classificazione geografica, poi la prequalifica). */
export function esitiPossibili(fase: string): string[] {
  if (fase === "NUOVO") return ["IN_TARGET", "FUORI_REGIONE"];
  if (fase === "APPUNTAMENTO_CASA" || fase === "APPUNTAMENTO_SHOWROOM" || fase === "APPUNTAMENTO_FISSATO") return ["APPUNTAMENTO_CASA", "APPUNTAMENTO_SHOWROOM", "APPUNTAMENTO_ANNULLATO", "NON_INTERESSATO"];
  if (fase === "FUORI_REGIONE" || fase === "NON_INTERESSATO") return ["IN_TARGET"]; // riapertura esplicita
  return PREQUALIFICA;
}

/** Scadenza dell'azione da fare dopo l'esito (le fasi chiuse non hanno scadenza). */
export function scadenzaDopoEsito(esito: string, adesso: Date, data?: Date | null): Date | null {
  if (esito === "DA_RICHIAMARE" || esito === "APPUNTAMENTO_CASA" || esito === "APPUNTAMENTO_SHOWROOM") return data ?? null;
  if (esito === "NON_RISPONDE") return scadenzaNuovoTentativo(adesso);
  if (esito === "FUORI_REGIONE" || esito === "NON_INTERESSATO") return null;
  return chiusuraGiornata(adesso);
}
