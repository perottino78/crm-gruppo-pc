// Linee di prodotto per l'analisi ricavi/margini, ricavate da famiglia e gruppo del modello
// (ModelloProdotto) delle righe di preventivo. Funzioni pure.
import { cent } from "./estratto";

export const LINEE = [
  "Serramenti e persiane",
  "Porte interne",
  "Blindati, cancelli e grate",
  "Zanzariere",
  "Tende interne",
  "Vetrate",
  "Pergole e bioclimatiche",
  "Tende da sole e schermature",
  "Giardino e pavimenti",
  "Motori e automatismi",
  "Fotovoltaico",
  "Climatizzazione",
  "Termico e pompe di calore",
  "Depurazione acqua",
  "Posa e servizi",
  "Altro",
] as const;
export type Linea = (typeof LINEE)[number];

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().trim();

/** Linea di prodotto da famiglia/gruppo del modello; brand e tipologia servono da ripiego. */
export function lineaDi(famiglia: string | null | undefined, gruppo: string | null | undefined, brand?: string | null, tipologia?: string | null): Linea {
  const f = norm(famiglia), g = norm(gruppo), t = norm(tipologia);
  if (f === "SERVIZI") return "Posa e servizi";
  if (f === "PURAFONTE" || norm(brand) === "PURAFONTE") return "Depurazione acqua";
  if (f === "SOLARIS") {
    if (/CONDIZIONATOR|CLIMATIZZAZIONE/.test(g)) return "Climatizzazione";
    if (/TRATTAMENTO ACQUA/.test(g)) return "Depurazione acqua";
    return "Termico e pompe di calore";
  }
  if (/^VETRATE|NUBES/.test(g) || t.startsWith("NUBES_")) return "Vetrate";
  if (/PORTE INTERNE/.test(g)) return "Porte interne";
  if (/BLINDAT|CANCELL|KOPEN|INFERRIAT|GRATE/.test(g)) return "Blindati, cancelli e grate";
  if (/ZANZARIER/.test(g)) return "Zanzariere";
  if (/TENDE INTERNE/.test(g)) return "Tende interne";
  if (/SERRAMENT|PERSIAN|SCATOLAT|TAPPARELL|PORTONCIN|CASSONETT/.test(g)) return "Serramenti e persiane";
  if (/PERGOL|BIOCLIMATIC|PENSILIN|GAZEB|COMPONENTI STRUTTURA|TELAI FISSI|CAPPOTTIN/.test(g)) return "Pergole e bioclimatiche";
  if (/^TENDE |TENDE A |ZIP|FRANGISOLE|VENEZIANE/.test(g)) return "Tende da sole e schermature";
  if (/GIARDINO|PAVIMENT/.test(g)) return "Giardino e pavimenti";
  if (/MOTORI|AUTOMATISM/.test(g)) return "Motori e automatismi";
  if (norm(brand) === "SOLARIS") return "Fotovoltaico";
  return "Altro";
}

/**
 * Ripartisce un importo totale fra le linee in proporzione ai pesi (es. valore lordo delle righe),
 * facendo tornare la somma esatta al centesimo (l'arrotondamento residuo va alla linea più grande).
 */
export function ripartisci(totale: number, pesi: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  const positivi = [...pesi.entries()].filter(([, v]) => v > 0);
  const somma = positivi.reduce((t, [, v]) => t + v, 0);
  if (!positivi.length || somma <= 0) {
    out.set("Altro", cent(totale));
    return out;
  }
  let assegnato = 0;
  for (const [k, v] of positivi) {
    const q = cent((totale * v) / somma);
    out.set(k, q);
    assegnato += q;
  }
  const resto = cent(totale - assegnato);
  if (resto !== 0) {
    const maggiore = positivi.sort((a, b) => b[1] - a[1])[0][0];
    out.set(maggiore, cent(out.get(maggiore)! + resto));
  }
  return out;
}

/** Somma due mappe linea → importo. */
export function sommaMappe(a: Map<string, number>, b: Map<string, number>, fattore = 1) {
  for (const [k, v] of b) a.set(k, cent((a.get(k) ?? 0) + v * fattore));
  return a;
}
