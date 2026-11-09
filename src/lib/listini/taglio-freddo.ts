// Serramenti in alluminio a taglio freddo e verande (listino P&C «ALLUMINIO TAGLIO FREDDO O VERANDE T.T»): prezzi di vendita
// al m² per sistema di apertura e tipo di vetro (3+3 stratificato o vetrocamera 2+2/12/4), più supplementi, colori e sconti
// per quantità. Calcolo MQ_CON_MINIMI (L × H in cm, arrotondati per eccesso ai 5 cm, nessuna area minima indicata a listino).
// Modulo puro: lo usano la rotta api/admin/seed-taglio-freddo e la pagina dell'offerta.

export const PREFISSO_TAGLIO_FREDDO = "TAGLIOFREDDO_";
export const SOTTOGRUPPO_TAGLIO_FREDDO = "Alluminio — Taglio freddo e verande";
export const LISTINO_TAGLIO_FREDDO = "TAGLIOFREDDO";
/** Il vecchio segnaposto «in arrivo» del gruppo SERRAMENTI che questo listino sostituisce. */
export const SEGNAPOSTO_TAGLIO_FREDDO = "SERRAMENTI_ALLUMINIOFREDDO_PLACEHOLDER";

type Sistema = { nome: string; foto: string; testo: string };
export const SISTEMI_TAGLIO_FREDDO: Record<string, Sistema> = {
  SCORR: { nome: "Scorrevole parallelo (taglio freddo)", foto: "scorrevole.jpg", testo: "Serramento scorrevole parallelo in alluminio a taglio freddo" },
  SCORRTT: { nome: "Scorrevole a taglio termico", foto: "profili.jpg", testo: "Serramento scorrevole in alluminio a taglio termico" },
  BATT: { nome: "Battente (taglio freddo)", foto: "finestre.jpg", testo: "Serramento a battente in alluminio a taglio freddo" },
  BATTTT: { nome: "Battente a taglio termico", foto: "profili.jpg", testo: "Serramento a battente in alluminio a taglio termico" },
  PIEG: { nome: "Pieghevole (taglio freddo)", foto: "pieghevole.jpg", testo: "Vetrata pieghevole a pacchetto in alluminio a taglio freddo" },
  FISSO: { nome: "Fianchetti fissi (taglio freddo)", foto: "finestre.jpg", testo: "Fianchetti fissi in alluminio a taglio freddo" },
};
export const VETRI_TAGLIO_FREDDO: Record<string, string> = { "33": "Vetro 3+3 (stratificato)", VC: "Vetrocamera 2+2/12/4" };

/** Prezzi di vendita €/m² del listino («/» = combinazione non disponibile). */
export const PREZZI_TAGLIO_FREDDO: Record<string, Partial<Record<keyof typeof VETRI_TAGLIO_FREDDO, number>>> = {
  SCORR: { "33": 510, VC: 541.44 },
  SCORRTT: { VC: 705.6 },
  BATT: { "33": 480, VC: 512.64 },
  BATTTT: { VC: 720 },
  PIEG: { "33": 735, VC: 757.44 },
  FISSO: { "33": 360, VC: 395 },
};

function parti(tipologia: string): { sistema: string; vetro: string } | null {
  const m = tipologia.match(/^TAGLIOFREDDO_([A-Z]+)_(33|VC)$/);
  return m && SISTEMI_TAGLIO_FREDDO[m[1]] && PREZZI_TAGLIO_FREDDO[m[1]]?.[m[2]] !== undefined ? { sistema: m[1], vetro: m[2] } : null;
}

/** Una riga «TARIFFA AL M²» per ogni combinazione sistema × vetro disponibile. */
export function prodottiTaglioFreddo() {
  return Object.entries(PREZZI_TAGLIO_FREDDO).flatMap(([sistema, prezzi]) =>
    Object.entries(prezzi).map(([vetro, prezzoBase]) => ({ tipologia: `${PREFISSO_TAGLIO_FREDDO}${sistema}_${vetro}`, colore: "TARIFFA AL M²", larghezzaMm: 100, altezzaMm: 100, prezzoBase: prezzoBase as number })));
}

export function assiSelezioneTaglioFreddo(tipologia: string) {
  const p = parti(tipologia);
  if (!p) return null;
  return { modello: { valore: p.sistema, label: SISTEMI_TAGLIO_FREDDO[p.sistema].nome }, apertura: { valore: p.vetro, label: VETRI_TAGLIO_FREDDO[p.vetro] } };
}
export function labelTaglioFreddo(tipologia: string): string | null {
  const a = assiSelezioneTaglioFreddo(tipologia);
  return a ? `${a.modello.label} — ${a.apertura.label}` : null;
}
export function fotoTaglioFreddo(tipologia: string): string | null {
  const p = parti(tipologia);
  return p ? `/immagini/taglio-freddo/${SISTEMI_TAGLIO_FREDDO[p.sistema].foto}` : null;
}

export function descrizioneTaglioFreddo(tipologia: string): string | null {
  const p = parti(tipologia);
  if (!p) return null;
  return `${SISTEMI_TAGLIO_FREDDO[p.sistema].testo}, adatto anche alla chiusura di verande e balconi, con ${VETRI_TAGLIO_FREDDO[p.vetro].toLowerCase()}. ` +
    `Colori di serie bianco, argento o avorio (altri colori +10%). Prezzo di vendita al m²: misure in cm arrotondate per eccesso ai 5 cm.`;
}

export type OptionalTaglioFreddo = { categoria: string; nome: string; tipoPrezzo: "FISSO" | "PERCENTUALE"; valore: number; unita: string | null; listino: string };
/** Supplementi, colori e sconti del listino (comuni a tutti i sistemi). Le percentuali si applicano al prezzo della riga. */
export function optionalTaglioFreddo(): OptionalTaglioFreddo[] {
  const o = (categoria: string, nome: string, tipoPrezzo: "FISSO" | "PERCENTUALE", valore: number, unita: string | null = null): OptionalTaglioFreddo =>
    ({ categoria, nome, tipoPrezzo, valore, unita, listino: LISTINO_TAGLIO_FREDDO });
  return [
    o("Colore", "Bianco", "FISSO", 0),
    o("Colore", "Argento", "FISSO", 0),
    o("Colore", "Avorio", "FISSO", 0),
    o("Colore", "Altri colori", "PERCENTUALE", 10),
    o("Supplementi", "Scorrevole su doppio telaio", "FISSO", 720, "cad."),
    o("Supplementi", "Foro nei vetri camera", "FISSO", 100, "cad."),
    o("Supplementi", "Inserto a wasistas (in aggiunta al prezzo al m²)", "FISSO", 245, "cad."),
    o("Supplementi", "Serramento centinato", "PERCENTUALE", 40),
    o("Smontaggio", "Smontaggio e smaltimento della veranda esistente (quantità = m²)", "FISSO", 24, "m²"),
    o("Sconti per quantità", "Sconto oltre 10 m² in totale", "PERCENTUALE", -5),
    o("Sconti per quantità", "Sconto oltre 20 m² in totale", "PERCENTUALE", -10),
    o("Sconti per quantità", "Sconto oltre 30 m² in totale", "PERCENTUALE", -15),
  ];
}

/** Lo sconto per quantità che spetta in base ai m² totali dell'ordine (0 fino a 10 m²). */
export function scontoQuantitaTaglioFreddo(mqTotali: number): number {
  return mqTotali > 30 ? 15 : mqTotali > 20 ? 10 : mqTotali > 10 ? 5 : 0;
}

export const GUIDA_TAGLIO_FREDDO =
  "Scrivi larghezza e altezza in cm: il prezzo è al m² (misure arrotondate ai 5 cm). Il colore bianco/argento/avorio è compreso. " +
  "Lo sconto per quantità va messo su ogni riga quando i m² di tutto l'ordine superano 10, 20 o 30. Lo smontaggio della vecchia veranda si conta a m² (scrivi i m² nella quantità).";
