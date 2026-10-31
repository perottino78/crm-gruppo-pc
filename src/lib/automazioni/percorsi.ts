// Percorsi automatici del lead: per ogni esito, quali email/solleciti partono e quando.
// Fase 1 dalla campagna Keap (acquisizione, In Target, Fuori Regione, Non risponde, Ricontatto, Non interessato);
// Fase 2: appuntamento (conferme, lettere di vendita, promemoria) e annullamento.
// Recupero (Prospect Lost Recovery di Keap, qui dopo N mesi): promozione al cliente e di nuovo in coda al centralino.
// Ogni nuovo esito annulla le azioni future del ciclo precedente. Funzioni pure: testabili senza database.
import { chiusuraGiornata, dopoGiorniAlle08, giornoDopoAlle08, dopoMesiAlle10, scadenzaNuovoTentativo, stessaOraFra } from "./tempi";
import { chiaveGiorno } from "@/lib/calendario/tempo";

export type Quando = { subito: true } | { dopoGiorni: number; conSabato?: boolean } | { giornoDopo: true } | { daRichiamo: number } | { daAppuntamento: number } | { dopoMesi: true };
// PRIMA_DEL_PROMEMORIA: lettera di vendita, si salta se cadrebbe nel giorno del promemoria o dopo (una email al giorno).
// NON_GIA_PASSATO: promemoria, si salta se l'appuntamento è stato fissato a meno di 24 ore (basta la conferma).
export type Condizione = "PRIMA_DEL_PROMEMORIA" | "NON_GIA_PASSATO";
export type Passo =
  | { tipo: "EMAIL"; modello: string; a: "CLIENTE" | "CENTRALINO" | "VENDITORE"; variante?: string; quando: Quando; nome: string; condizione?: Condizione }
  | { tipo: "TIMEOUT"; quando: Quando; nome: string }
  // promozione al cliente, poi il lead torna "Da recuperare" in coda al centralino (percorso RECUPERO)
  | { tipo: "RECUPERO"; quando: Quando; nome: string };

/** Quante volte al massimo un lead perso viene recuperato (per non insistere all'infinito). */
export const MAX_RECUPERI = 2;
export const MESI_RECUPERO_DEFAULT = 3;
const recupero: Passo = { tipo: "RECUPERO", quando: { dopoMesi: true }, nome: "Recupero: promozione al cliente e nuova chiamata" };

const appuntamento = (luogo: "CASA" | "SHOWROOM"): Passo[] => [
  { tipo: "EMAIL", modello: "appointment-confirmed-contact", variante: luogo, a: "CLIENTE", quando: { subito: true }, nome: "Conferma appuntamento (cliente)" },
  { tipo: "EMAIL", modello: "appointment-confirmed-seller", variante: luogo, a: "VENDITORE", quando: { subito: true }, nome: "Nuovo appuntamento (venditore)" },
  { tipo: "EMAIL", modello: "sales-letter-1", a: "CLIENTE", quando: { giornoDopo: true }, nome: "Lettera 1: chi siamo", condizione: "PRIMA_DEL_PROMEMORIA" },
  { tipo: "EMAIL", modello: "sales-letter-2", a: "CLIENTE", quando: { giornoDopo: true }, nome: "Lettera 2: perché sceglierci", condizione: "PRIMA_DEL_PROMEMORIA" },
  { tipo: "EMAIL", modello: "sales-letter-3", a: "CLIENTE", quando: { giornoDopo: true }, nome: "Lettera 3: cosa dicono i clienti", condizione: "PRIMA_DEL_PROMEMORIA" },
  { tipo: "EMAIL", modello: "sales-letter-4", a: "CLIENTE", quando: { giornoDopo: true }, nome: "Lettera 4: promozioni e finanziamenti", condizione: "PRIMA_DEL_PROMEMORIA" },
  { tipo: "EMAIL", modello: "appointment-reminder-contact", variante: luogo, a: "CLIENTE", quando: { daAppuntamento: -1 }, nome: "Promemoria il giorno prima (cliente)", condizione: "NON_GIA_PASSATO" },
  { tipo: "EMAIL", modello: "appointment-reminder-seller", variante: luogo, a: "VENDITORE", quando: { daAppuntamento: -1 }, nome: "Promemoria il giorno prima (venditore)", condizione: "NON_GIA_PASSATO" },
];

export const PERCORSI: Record<string, Passo[]> = {
  NUOVO: [{ tipo: "EMAIL", modello: "qualification-requested", a: "CENTRALINO", quando: { subito: true }, nome: "Avviso al centralino: da classificare" }],
  IN_TARGET: [
    { tipo: "EMAIL", modello: "request-received", a: "CLIENTE", quando: { subito: true }, nome: "Grazie per la richiesta (cliente)" },
    { tipo: "EMAIL", modello: "call-requested", variante: "initial-prequalification", a: "CENTRALINO", quando: { subito: true }, nome: "Da chiamare #1" },
    { tipo: "EMAIL", modello: "call-requested", variante: "initial-prequalification", a: "CENTRALINO", quando: { dopoGiorni: 1 }, nome: "Da chiamare #2" },
    { tipo: "EMAIL", modello: "call-requested", variante: "initial-prequalification", a: "CENTRALINO", quando: { dopoGiorni: 1 }, nome: "Da chiamare #3" },
    { tipo: "TIMEOUT", quando: { dopoGiorni: 20 }, nome: "Non gestito dopo 20 giorni" },
    recupero,
  ],
  FUORI_REGIONE: [{ tipo: "EMAIL", modello: "region-not-served", a: "CLIENTE", quando: { subito: true }, nome: "Regione non servita (cliente)" }],
  NON_RISPONDE: [
    { tipo: "EMAIL", modello: "call-unanswered-contact", a: "CLIENTE", quando: { subito: true }, nome: "Abbiamo provato a chiamarti (cliente)" },
    { tipo: "EMAIL", modello: "call-requested", variante: "call-unanswered-reminder", a: "CENTRALINO", quando: { dopoGiorni: 1 }, nome: "Richiama #1" },
    { tipo: "EMAIL", modello: "call-requested", variante: "call-unanswered-reminder", a: "CENTRALINO", quando: { dopoGiorni: 1 }, nome: "Richiama #2" },
    { tipo: "EMAIL", modello: "call-requested", variante: "call-unanswered-reminder", a: "CENTRALINO", quando: { dopoGiorni: 1 }, nome: "Richiama #3" },
    { tipo: "TIMEOUT", quando: { dopoGiorni: 20, conSabato: false }, nome: "Non gestito dopo 20 giorni" },
    recupero,
  ],
  DA_RICHIAMARE: [
    { tipo: "EMAIL", modello: "callback-confirmed", a: "CLIENTE", quando: { subito: true }, nome: "Ti ricontatteremo (cliente)" },
    { tipo: "EMAIL", modello: "call-requested", variante: "scheduled-first-contact", a: "CENTRALINO", quando: { daRichiamo: 0 }, nome: "Ricontatto: giorno R" },
    { tipo: "EMAIL", modello: "call-requested", variante: "scheduled-first-contact", a: "CENTRALINO", quando: { daRichiamo: 1 }, nome: "Ricontatto: R+1" },
    { tipo: "EMAIL", modello: "call-requested", variante: "scheduled-first-contact", a: "CENTRALINO", quando: { daRichiamo: 2 }, nome: "Ricontatto: R+2" },
    { tipo: "TIMEOUT", quando: { daRichiamo: 20 }, nome: "Non gestito dopo R+20" },
    recupero,
  ],
  NON_INTERESSATO: [{ tipo: "EMAIL", modello: "interest-closed", a: "CLIENTE", quando: { subito: true }, nome: "Restiamo in contatto (cliente)" }, recupero],
  // Lead recuperato: il centralino lo richiama (3 giorni dopo la promozione, poi i giorni seguenti)
  RECUPERO: [
    { tipo: "EMAIL", modello: "lost-recovery-call-requested", a: "CENTRALINO", quando: { dopoGiorni: 3 }, nome: "Recupera il contatto #1" },
    { tipo: "EMAIL", modello: "lost-recovery-call-requested", a: "CENTRALINO", quando: { dopoGiorni: 1 }, nome: "Recupera il contatto #2" },
    { tipo: "EMAIL", modello: "lost-recovery-call-requested", a: "CENTRALINO", quando: { dopoGiorni: 1 }, nome: "Recupera il contatto #3" },
    { tipo: "TIMEOUT", quando: { dopoGiorni: 20 }, nome: "Non gestito dopo 20 giorni" },
    recupero,
  ],
  // Appuntamento fissato con il venditore già scelto
  APPUNTAMENTO_CASA: appuntamento("CASA"),
  APPUNTAMENTO_SHOWROOM: appuntamento("SHOWROOM"),
  // Appuntamento fissato senza venditore: il centralino lo assegna, poi parte il percorso dell'appuntamento
  ASSEGNA_VENDITORE_CASA: [{ tipo: "EMAIL", modello: "seller-assignment-requested", variante: "CASA", a: "CENTRALINO", quando: { subito: true }, nome: "Venditore da assegnare (centralino)" }],
  ASSEGNA_VENDITORE_SHOWROOM: [{ tipo: "EMAIL", modello: "seller-assignment-requested", variante: "SHOWROOM", a: "CENTRALINO", quando: { subito: true }, nome: "Venditore da assegnare (centralino)" }],
  APPUNTAMENTO_ANNULLATO: [
    { tipo: "EMAIL", modello: "appointment-cancelled-seller", a: "VENDITORE", quando: { subito: true }, nome: "Appuntamento annullato (venditore)" },
    { tipo: "EMAIL", modello: "cancellation-follow-up-requested", a: "CENTRALINO", quando: { subito: true }, nome: "Definisci il seguito (centralino)" },
  ],
};

/** Fase del lead in cui un percorso resta valido (i percorsi "assegna venditore" vivono nella fase dell'appuntamento). */
export const faseDelPercorso = (percorso: string) => percorso.replace(/^ASSEGNA_VENDITORE_/, "APPUNTAMENTO_");

/** Quando eseguire un passo: `riferimento` è il momento in cui si è concluso il passo precedente (o l'esito). */
export function quandoPasso(q: Quando, riferimento: Date, date: { richiamoIl?: Date | null; appuntamentoIl?: Date | null; mesiRecupero?: number } = {}): Date {
  if ("subito" in q) return riferimento;
  if ("dopoMesi" in q) return dopoMesiAlle10(riferimento, date.mesiRecupero ?? MESI_RECUPERO_DEFAULT);
  if ("dopoGiorni" in q) return dopoGiorniAlle08(riferimento, q.dopoGiorni, q.conSabato ?? true);
  if ("giornoDopo" in q) return giornoDopoAlle08(riferimento);
  if ("daAppuntamento" in q) {
    if (!date.appuntamentoIl) throw new Error("Manca la data dell'appuntamento");
    return stessaOraFra(date.appuntamentoIl, q.daAppuntamento);
  }
  if (!date.richiamoIl) throw new Error("Manca la data del ricontatto");
  return stessaOraFra(date.richiamoIl, q.daRichiamo);
}

/** Un passo con condizione va saltato? (lettere troppo vicine all'appuntamento, promemoria già superati) */
export function daSaltare(c: Condizione | undefined, previsto: Date, programmatoIl: Date, appuntamentoIl?: Date | null): string | null {
  if (!c || !appuntamentoIl) return null;
  const promemoria = appuntamentoIl.getTime() - 24 * 3600 * 1000;
  if (c === "PRIMA_DEL_PROMEMORIA" && chiaveGiorno(previsto) >= chiaveGiorno(new Date(promemoria))) return "troppo vicina all'appuntamento";
  if (c === "NON_GIA_PASSATO" && previsto.getTime() < programmatoIl.getTime() - 60_000) return "appuntamento fissato a meno di 24 ore: basta la conferma";
  return null;
}

// ---- Fasi ed esiti del lead ----

export const FASI_LEAD: Record<string, { nome: string; azione: string | null; chiusa?: boolean; colore: string }> = {
  NUOVO: { nome: "Da classificare", azione: "In target o Fuori regione?", colore: "bg-blue-100 text-blue-900" },
  IN_TARGET: { nome: "In target", azione: "Chiamata di prequalifica", colore: "bg-green-100 text-green-900" },
  NON_RISPONDE: { nome: "Non risponde", azione: "Nuovo tentativo di chiamata", colore: "bg-amber-100 text-amber-900" },
  DA_RICHIAMARE: { nome: "Da richiamare", azione: "Ricontatto concordato", colore: "bg-amber-100 text-amber-900" },
  APPUNTAMENTO_CASA: { nome: "Appuntamento a casa", azione: "Appuntamento", colore: "bg-purple-100 text-purple-900" },
  APPUNTAMENTO_SHOWROOM: { nome: "Appuntamento in showroom", azione: "Appuntamento", colore: "bg-purple-100 text-purple-900" },
  APPUNTAMENTO_ANNULLATO: { nome: "Appuntamento annullato", azione: "Definisci il seguito", colore: "bg-red-100 text-red-900" },
  NON_INTERESSATO: { nome: "Non interessato", azione: null, chiusa: true, colore: "bg-neutral-200 text-neutral-700" },
  RECUPERO: { nome: "Da recuperare", azione: "Richiama: gli abbiamo mandato la promozione", colore: "bg-teal-100 text-teal-900" },
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
  // appuntamento fissato: la "scadenza" è l'appuntamento stesso
  if (esito === "DA_RICHIAMARE" || esito === "APPUNTAMENTO_CASA" || esito === "APPUNTAMENTO_SHOWROOM") return data ?? null;
  if (esito === "NON_RISPONDE") return scadenzaNuovoTentativo(adesso);
  if (esito === "FUORI_REGIONE" || esito === "NON_INTERESSATO") return null;
  return chiusuraGiornata(adesso);
}
