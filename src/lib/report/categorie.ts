// Linea di prodotto di una fattura o di un progetto BConsole, dal testo (descrizione del progetto e righe della fattura).
// Usa le stesse linee della pagina Costi e ricavi (LINEE). Funzioni pure, testate in tests/report/categorie.test.ts.
import type { Linea } from "@/lib/amministrazione/linee";

// Dal più specifico al più generico: "Pergola + vetrate" → Pergole, "Tettoia + zanzariere" → Pergole.
const REGOLE: [Linea, RegExp][] = [
  ["Posa e servizi", /assistenz|chiamata tecnico|riparazion|manutenzion|sopralluog|spese di istruttoria/],
  ["Fotovoltaico", /fotovoltaic|\bkit fv\b|accumul|inverter|batteri|\d\s?kw\b|wallbox|colonnin/],
  ["Termico e pompe di calore", /pompa di calore|pompe di calore|scaldacqua|scalda acqua|caldaia|termico|solare termico/],
  ["Climatizzazione", /climatizz|condizionator|split|clima\b/],
  ["Depurazione acqua", /depurat|osmosi|addolcitor|purafonte|pura fonte|acqua potabile|micro ad osmosi/],
  ["Pergole e bioclimatiche", /pergol|tettoi|bioclimatic|copertur|nebus|panarea|lucilla|nuvola|fidra|carport/],
  ["Vetrate", /vetrat|vepa|chiusura portico|chiusura balcone|chiusura pergola|chiususa|panoramic/],
  ["Zanzariere", /zanzarier|pliss/],
  ["Tende da sole e schermature", /tend[ae]\b|tende|telo\b|teli\b|madrid|samba|frangisole|schermatur|cappottin/],
  ["Blindati, cancelli e grate", /blindat|portoncin|cancell|grat[ae]\b|inferriat/],
  ["Porte interne", /porte interne|porta interna|porte\b/],
  ["Serramenti e persiane", /serrament|finestr|infiss|persian|tapparell|oscurant|scuri\b|optima|portafinestr|vetrocamera/],
  ["Motori e automatismi", /motor|automatism|domotic/],
  ["Giardino e pavimenti", /pavimen|giardin|decking|recinzion/],
];

// Righe che non dicono nulla sul prodotto (testi fiscali, acconti generici, totali)
const INUTILE = /^(si dichiara|corrispettivo per|totale|imponibile|operazione |iva |per anticipazione|a dedurre|come da contratto|rif\. pratica|materiale da installare|n\. \d+ zanzarier\w* std: omaggio|\*$)/;

/** Testo utile di una riga fattura (null se è una frase fiscale o un totale). */
export function rigaUtile(dsc: string | null | undefined): string | null {
  const t = (dsc ?? "").replace(/\s+/g, " ").trim();
  if (!t || INUTILE.test(t.toLowerCase())) return null;
  return t;
}

/** Linea di prodotto del testo, o null se non si riconosce. */
export function lineaDaTesto(testo: string | null | undefined): Linea | null {
  const t = (testo ?? "").toLowerCase().replace(/rif\.prev\. n\.\s*[\d/]+;?/g, " ");
  for (const [linea, re] of REGOLE) if (re.test(t)) return linea;
  return null;
}

/**
 * Linea di prodotto di una fattura: prima la descrizione del progetto (dice cosa si è venduto), poi le righe
 * della fattura, poi il marchio (Solaris → Fotovoltaico, Purafonte → Depurazione), altrimenti "Altro".
 */
export function categoriaFattura(p: { progetto?: string | null; righe?: (string | null)[]; riferimento?: string | null; marchio?: string | null }): Linea {
  const daProgetto = lineaDaTesto(p.progetto);
  if (daProgetto) return daProgetto;
  for (const r of p.righe ?? []) { const l = lineaDaTesto(rigaUtile(r)); if (l) return l; }
  const daRif = lineaDaTesto(p.riferimento);
  if (daRif) return daRif;
  if (/solaris/i.test(p.marchio ?? "")) return "Fotovoltaico";
  if (/pura/i.test(p.marchio ?? "")) return "Depurazione acqua";
  return "Altro";
}

/** Descrizione breve delle righe (per mostrarla nei report). */
export function descrizioneBreve(righe: (string | null)[], max = 160): string | null {
  const utili = [...new Set(righe.map(rigaUtile).filter((x): x is string => !!x))];
  if (!utili.length) return null;
  const t = utili.join(" · ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
