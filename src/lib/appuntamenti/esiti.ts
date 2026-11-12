// Esito degli appuntamenti (richiesta di Cristina e Ugo, nov 2026): il commerciale deve esitare le visite fatte. Il giorno dopo gli arriva un
// promemoria (email + riquadro in Dashboard), dopo N giorni l'appuntamento finisce nella lista «Appuntamenti senza esito» del centralino.
// Facoltativo il blocco: chi ha troppi appuntamenti senza esito non riceve nuovi appuntamenti dal centralino. Regole pure, testate.
import { aggiungiGiorni, chiaveGiorno, inizioGiorno } from "@/lib/calendario/tempo";

export type RegoleEsiti = { giorniPromemoria: number; giorniLista: number; bloccoAttivo: boolean; sogliaBlocco: number; sbloccati: string[]; dal: string };
export const REGOLE_PREDEFINITE: RegoleEsiti = { giorniPromemoria: 1, giorniLista: 2, bloccoAttivo: false, sogliaBlocco: 3, sbloccati: [], dal: "2026-11-09" };
// «dal»: si contano solo gli appuntamenti da questo giorno (il centralino è passato su P&C ONE il 9/11/2026; prima erano su BConsole)
export const CHIAVI_ESITI = { promemoria: "esiti_giorni_promemoria", lista: "esiti_giorni_lista", blocco: "esiti_blocco_attivo", soglia: "esiti_blocco_soglia", sbloccati: "esiti_sbloccati", mail: "esiti_mail_giorno", dal: "esiti_dal" } as const;

const intero = (v: string | null | undefined, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== undefined && v !== "" ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

/** Le regole lette dalla configurazione (valori mancanti o sbagliati = quelli predefiniti). */
export function leggiRegole(c: Record<string, string | null | undefined>): RegoleEsiti {
  let sbloccati: string[] = [];
  try { const j = JSON.parse(c[CHIAVI_ESITI.sbloccati] ?? "[]"); if (Array.isArray(j)) sbloccati = j.filter((x) => typeof x === "string"); } catch { /* vuoto */ }
  const giorniPromemoria = intero(c[CHIAVI_ESITI.promemoria], REGOLE_PREDEFINITE.giorniPromemoria, 1, 30);
  return {
    giorniPromemoria,
    giorniLista: Math.max(giorniPromemoria, intero(c[CHIAVI_ESITI.lista], REGOLE_PREDEFINITE.giorniLista, 1, 60)),
    bloccoAttivo: c[CHIAVI_ESITI.blocco] === "1",
    sogliaBlocco: intero(c[CHIAVI_ESITI.soglia], REGOLE_PREDEFINITE.sogliaBlocco, 1, 50),
    sbloccati,
    dal: /^\d{4}-\d{2}-\d{2}$/.test(c[CHIAVI_ESITI.dal] ?? "") ? c[CHIAVI_ESITI.dal]! : REGOLE_PREDEFINITE.dal,
  };
}

/** Stati di un appuntamento ancora da esitare. */
export const STATI_DA_ESITARE = ["PROGRAMMATO", "CONFERMATO"];

/** Gli appuntamenti con giorno (di Roma) prima di questo limite sono «da esitare» dopo `giorni` giorni: limite = inizio di (oggi − giorni + 1). */
export function limiteGiorni(oggi: string, giorni: number): Date {
  return inizioGiorno(aggiungiGiorni(oggi, 1 - giorni));
}

export type AppDaEsitare = { id: string; utenteId: string; dataOra: Date; stato: string };

/** Quanti giorni sono passati dal giorno dell'appuntamento (0 = oggi). */
export function giorniPassati(dataOra: Date, oggi: string): number {
  const g = chiaveGiorno(dataOra);
  return Math.round((inizioGiorno(oggi).getTime() - inizioGiorno(g).getTime()) / 86_400_000);
}

/** Da esitare per il promemoria (≥ giorniPromemoria) e per la lista del centralino (≥ giorniLista). */
export function classifica(a: AppDaEsitare, oggi: string, r: RegoleEsiti): "NIENTE" | "PROMEMORIA" | "LISTA" {
  if (!STATI_DA_ESITARE.includes(a.stato) || chiaveGiorno(a.dataOra) < r.dal) return "NIENTE";
  const g = giorniPassati(a.dataOra, oggi);
  return g >= r.giorniLista ? "LISTA" : g >= r.giorniPromemoria ? "PROMEMORIA" : "NIENTE";
}

/** Il commerciale è bloccato (non riceve nuovi appuntamenti dal centralino)? Solo con il blocco acceso e se non è stato sbloccato. */
export function bloccato(utenteId: string, senzaEsito: number, r: RegoleEsiti): boolean {
  return r.bloccoAttivo && !r.sbloccati.includes(utenteId) && senzaEsito >= r.sogliaBlocco;
}

/** Inizio del giorno da cui si contano gli appuntamenti («dal»). */
export const inizioDal = (dal: string) => inizioGiorno(dal);
