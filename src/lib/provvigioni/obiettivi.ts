// Obiettivi di fatturato e premi dei commerciali (richiesta di Ugo, nov 2026): l'amministrazione dà a ogni commerciale un
// obiettivo del mese e uno dell'anno, ognuno con il suo premio; la tabella di marcia dice se è in linea (quanto doveva aver
// venduto a oggi, in proporzione ai giorni passati) e ogni settimana parte un'email con il punto e due parole di incoraggiamento.
// Il «fatturato» è il venduto: imponibile dei contratti (commesse del CRM e progetti BConsole) nel periodo, ora di Roma.
// Modulo puro, testato in tests/provvigioni/obiettivi.test.ts.
import { chiaveGiorno } from "@/lib/calendario/tempo";
import { cent } from "./calcoli";

export const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export const periodoMese = (oggi: string) => oggi.slice(0, 7);
export const periodoAnno = (oggi: string) => oggi.slice(0, 4);
export const eAnnuale = (periodo: string) => /^\d{4}$/.test(periodo);
export const nomePeriodo = (periodo: string) => (eAnnuale(periodo) ? `anno ${periodo}` : `${MESI[+periodo.slice(5, 7) - 1]} ${periodo.slice(0, 4)}`);

const giorno = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const GIORNO = 86_400_000;

/** Primo e ultimo giorno del periodo ("2026-11" o "2026"). */
export function estremi(periodo: string): { da: string; a: string } {
  if (eAnnuale(periodo)) return { da: `${periodo}-01-01`, a: `${periodo}-12-31` };
  const [a, m] = periodo.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { da: `${periodo}-01`, a: `${periodo}-${String(ultimo).padStart(2, "0")}` };
}

/** Venduto nel periodo: imponibile dei contratti con data (ora di Roma) dentro il periodo. */
export function vendutoNelPeriodo(contratti: { data: Date | null; imponibile: number }[], periodo: string): number {
  return cent(contratti.filter((c) => c.data && chiaveGiorno(c.data).startsWith(periodo)).reduce((s, c) => s + c.imponibile, 0));
}

/** Venduto mese per mese dell'anno (12 valori). */
export function vendutoPerMese(contratti: { data: Date | null; imponibile: number }[], anno: string): number[] {
  return Array.from({ length: 12 }, (_, i) => vendutoNelPeriodo(contratti, `${anno}-${String(i + 1).padStart(2, "0")}`));
}

export type StatoObiettivo = "RAGGIUNTO" | "IN_LINEA" | "VICINO" | "INDIETRO" | "NON_INIZIATO";

export const NOMI_STATO_OBIETTIVO: Record<StatoObiettivo, string> = {
  RAGGIUNTO: "🏆 Raggiunto", IN_LINEA: "✅ In linea", VICINO: "🟡 Quasi in linea", INDIETRO: "🔴 Indietro", NON_INIZIATO: "⏳ Non ancora iniziato",
};

export type Avanzamento = {
  target: number; venduto: number; percentuale: number; atteso: number; mancano: number; scarto: number;
  giorniTotali: number; giorniPassati: number; giorniRimasti: number; perSettimana: number; stato: StatoObiettivo;
};

/**
 * Tabella di marcia: a oggi il commerciale «dovrebbe» aver venduto target × giorni passati / giorni del periodo (oggi compreso).
 * In linea se ci è arrivato, quasi se è almeno all'80% di quel valore.
 */
export function avanzamento(target: number, venduto: number, periodo: string, oggi: string): Avanzamento {
  const { da, a } = estremi(periodo);
  const giorniTotali = Math.round((giorno(a) - giorno(da)) / GIORNO) + 1;
  const giorniPassati = Math.min(giorniTotali, Math.max(0, Math.round((giorno(oggi) - giorno(da)) / GIORNO) + 1));
  const giorniRimasti = giorniTotali - giorniPassati;
  const atteso = cent(target * giorniPassati / giorniTotali);
  const mancano = cent(Math.max(0, target - venduto));
  const perSettimana = cent(giorniRimasti > 0 ? mancano / Math.max(1, Math.ceil(giorniRimasti / 7)) : mancano);
  const stato: StatoObiettivo = target > 0 && venduto >= target - 0.005 ? "RAGGIUNTO"
    : giorniPassati === 0 ? "NON_INIZIATO"
    : venduto >= atteso - 0.005 ? "IN_LINEA"
    : venduto >= atteso * 0.8 ? "VICINO" : "INDIETRO";
  return { target, venduto: cent(venduto), percentuale: target > 0 ? venduto / target : 0, atteso, mancano, scarto: cent(venduto - atteso), giorniTotali, giorniPassati, giorniRimasti, perSettimana, stato };
}

// ---------- email della settimana ----------

const INCORAGGIAMENTI: Record<StatoObiettivo, string[]> = {
  RAGGIUNTO: [
    "Obiettivo centrato: complimenti, è un risultato che fa la differenza per tutto il Gruppo! Ogni contratto in più adesso è un passo verso il record.",
    "Ce l'hai fatta: grande lavoro! Goditi il risultato e continua così, i clienti si fidano di chi lavora come te.",
  ],
  IN_LINEA: [
    "Sei perfettamente in linea: il ritmo è quello giusto, continua così!",
    "Ottimo passo: stai andando esattamente dove devi andare. Tieni alta la concentrazione sulle offerte aperte.",
    "Bel lavoro: sei in tabella di marcia. Un paio di richiami alle offerte in sospeso e la settimana è tua.",
  ],
  VICINO: [
    "Sei a un passo dalla tabella di marcia: basta un contratto per rimetterti in linea. Riprendi in mano le offerte aperte più calde!",
    "Manca davvero poco: questa settimana chiama i clienti che aspettano una risposta, sono la strada più corta per recuperare.",
  ],
  INDIETRO: [
    "Sei un po' indietro rispetto alla tabella di marcia, ma c'è tutto il tempo per recuperare: punta sulle offerte già aperte e sui clienti che hanno chiesto un preventivo di recente. Noi siamo qui per aiutarti.",
    "Il mese non è finito: ogni appuntamento è un'occasione. Organizza la settimana sui clienti più vicini alla firma e fatti aiutare dall'ufficio se serve.",
  ],
  NON_INIZIATO: ["Si parte: buon lavoro e buone vendite!"],
};

/** Una frase d'incoraggiamento (cambia di settimana in settimana). */
export const incoraggiamento = (stato: StatoObiettivo, settimana: number) => INCORAGGIAMENTI[stato][Math.abs(settimana) % INCORAGGIAMENTI[stato].length];

/** Numero della settimana ISO di una data "AAAA-MM-GG" (per la chiave «già mandata questa settimana»). */
export function settimanaIso(oggi: string): string {
  const d = new Date(giorno(oggi));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const inizioAnno = Date.UTC(d.getUTCFullYear(), 0, 1);
  const n = Math.ceil(((d.getTime() - inizioAnno) / GIORNO + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(n).padStart(2, "0")}`;
}

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

function righePeriodo(titolo: string, av: Avanzamento, premio: number | null): string[] {
  const out = [`${titolo}: obiettivo ${eur(av.target)}${premio ? ` (premio ${eur(premio)})` : ""}`,
    `- venduto finora ${eur(av.venduto)} = ${Math.round(av.percentuale * 100)}% — ${NOMI_STATO_OBIETTIVO[av.stato]}`];
  if (av.stato !== "RAGGIUNTO") {
    out.push(`- a oggi la tabella di marcia era ${eur(av.atteso)} (${av.scarto >= 0 ? `sei avanti di ${eur(av.scarto)}` : `mancano ${eur(-av.scarto)} per essere in linea`})`);
    out.push(`- per arrivare all'obiettivo mancano ${eur(av.mancano)}${av.giorniRimasti > 0 ? `: circa ${eur(av.perSettimana)} a settimana nei prossimi ${av.giorniRimasti} giorni` : ""}`);
  }
  return out;
}

/** Testo dell'email settimanale al commerciale (mese e/o anno). Null se non ha obiettivi. */
export function emailSettimanale(o: {
  nome: string; oggi: string;
  mese?: { periodo: string; av: Avanzamento; premio: number | null } | null;
  anno?: { periodo: string; av: Avanzamento; premio: number | null } | null;
  link: string;
}): { oggetto: string; testo: string } | null {
  if (!o.mese && !o.anno) return null;
  const principale = (o.mese ?? o.anno)!;
  const sett = +settimanaIso(o.oggi).slice(-2);
  const nome = o.nome.split(/\s+/)[0];
  const testo = [
    `Ciao ${nome},`, "",
    "ecco il punto della settimana sui tuoi obiettivi.", "",
    ...(o.mese ? [...righePeriodo(`📅 ${nomePeriodo(o.mese.periodo)}`, o.mese.av, o.mese.premio), ""] : []),
    ...(o.anno ? [...righePeriodo(`📈 ${nomePeriodo(o.anno.periodo)}`, o.anno.av, o.anno.premio), ""] : []),
    incoraggiamento(principale.av.stato, sett), "",
    `Trovi i tuoi contratti e le provvigioni qui: ${o.link}`, "",
    "Buon lavoro!", "Gruppo P&C",
  ].join("\n");
  const stato = NOMI_STATO_OBIETTIVO[principale.av.stato].replace(/^\S+\s/, "").toLowerCase();
  return { oggetto: `[CRM P&C] I tuoi obiettivi: ${stato} (${Math.round(principale.av.percentuale * 100)}% di ${nomePeriodo(principale.periodo)})`, testo };
}
