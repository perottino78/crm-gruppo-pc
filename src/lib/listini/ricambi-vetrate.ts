// Accessori e ricambi delle vetrate (richiesta di Ugo 24/11/2026): articoli presi dalle schede prodotto di BConsole,
// stesso codice di BConsole (così un import successivo li riconosce e non fa doppioni). Dati puri, senza database.
// Per aggiungerne altri: una voce in RICAMBI_VETRATE e alza VERSIONE_RICAMBI_VETRATE.

export const VERSIONE_RICAMBI_VETRATE = "2026-11-25d";
/** Albero in Articoli: OUTDOOR › VETRATE › «Accessori e ricambi» › tipo di vetrata. «Complementi vetrate» è la cartella della prima versione (resta per i legni). */
export const CATEGORIA_MADRE = "Complementi vetrate";
export const CATEGORIA_RICAMBI = "Accessori e ricambi";
/** Una cartella per vetrata dentro «Accessori e ricambi» (Ugo 25/11/2026: «dividerle per Scintilla e Brillante»). */
export const SISTEMI_VETRATA = ["Scintilla", "Brillante"] as const;
/** Nomi delle cartelle della versione «b» (24/11/2026), rinominate: lo scorrevole è la Scintilla, il pacchetto la Brillante. */
export const NOMI_VECCHI: Record<string, (typeof SISTEMI_VETRATA)[number]> = { "Vetrata scorrevole": "Scintilla", "Vetrata a pacchetto": "Brillante" };
/** Il pulsante a parte nella finestra «Aggiungi prodotto» dell'offerta (OUTDOOR › RICAMBI VETRATE). */
export const GRUPPO_RICAMBI_VETRATE = "RICAMBI VETRATE";
export type SistemaVetrata = (typeof SISTEMI_VETRATA)[number];
/** Cartella della prima versione, sostituita da «Scintilla» (vuota, si toglie). */
export const CATEGORIA_VECCHIA = "Scorrevole parallelo";

/** Articoli caricati a mano da Ugo in «complementi» da spostare una volta nella cartella giusta (24/11/2026). */
export const DA_SPOSTARE: { codice: string; sistema: SistemaVetrata }[] = [
  { codice: "ART-00002", sistema: "Brillante" }, // CF tappo di fondo con gancio inox nero
  { codice: "ART-00003", sistema: "Brillante" }, // CF gancio grigio
  { codice: "ART-00004", sistema: "Brillante" }, // CF supporto gancio
  { codice: "ART-00005", sistema: "Brillante" }, // CF tappo di fondo centrale inox nero
];

export type RicambioVetrata = {
  codice: string;
  descrizione: string;
  /** testo per il cliente (va nell'offerta sotto il nome) */
  descrizioneEstesa: string;
  /** vetrata (cartella dentro «Accessori e ricambi»: Scintilla o Brillante) */
  sistema: SistemaVetrata;
  um: "m" | "pz";
  costo: number;
  vendita: number;
  immagine?: string;
};

export const RICAMBI_VETRATE: RicambioVetrata[] = [
  {
    codice: "2360",
    descrizione: "Guarnizione vetrata tra anta e anta 10 mm",
    descrizioneEstesa: "Guarnizione tra i vetri, standard: le guarnizioni in PVC aiutano a sigillare il sistema dal maltempo senza influenzare l'estetica della vetrata.",
    sistema: "Scintilla",
    um: "m",
    costo: 8.7,
    vendita: 24,
    immagine: "/immagini/ricambi-vetrate/2360.webp",
  },
  // Brillante (apertura a libro), schede BConsole del 25/11/2026; nomi corretti dai refusi della scheda («GUARNIIZIONE», «CXALAMITA NTEGRATA»)
  {
    codice: "23112",
    descrizione: "Guarnizione ad H per angolo con calamita integrata 10 mm, 2950 mm",
    descrizioneEstesa: "Guarnizione ad H per la chiusura d'angolo fra due ante: la calamita integrata tiene unite le ante chiuse e migliora la tenuta all'aria e all'acqua.",
    sistema: "Brillante",
    um: "pz",
    costo: 16.31,
    vendita: 32.54,
    immagine: "/immagini/ricambi-vetrate/23112.webp",
  },
  {
    codice: "BRI1409",
    descrizione: "Guarnizione H semisferica Brillante",
    descrizioneEstesa: "Guarnizione trasparente ad H semisferica fra le ante: sigilla la vetrata senza vedersi.",
    sistema: "Brillante",
    um: "pz",
    costo: 11.9,
    vendita: 44.34,
    immagine: "/immagini/ricambi-vetrate/BRI1409.webp",
  },
];

/** Gli articoli venduti al metro accettano quantità con i decimali (es. 4,5 m); a pezzo solo interi. */
export const alMetro = (um: string | null | undefined) => /^(m|mt|metri?)$/i.test((um ?? "").trim());

const euro = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" as unknown as boolean });
const num = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

/**
 * La riga d'offerta per un articolo. A pezzo: quantità intera al prezzo dell'articolo. Al metro: la quantità della riga è 1
 * (nel database è un numero intero) e il prezzo è metri × €/mt, con i metri scritti nel testo («4,5 mt × 24,00 €/mt»), come la lattoneria.
 * Sotto il nome va la descrizione per il cliente, se c'è.
 */
export function rigaArticolo(
  a: { codice: string; descrizione: string; descrizioneEstesa?: string | null; um?: string | null; prezzoVendita: number | null },
  quantitaScritta: string | null | undefined,
): { testoLibero: string; quantita: number; prezzoUnitario: number } {
  const n = parseFloat(String(quantitaScritta ?? "1").replace(",", "."));
  const prezzo = a.prezzoVendita ?? 0;
  const estesa = (a.descrizioneEstesa ?? "").trim();
  const nome = `${a.codice} — ${a.descrizione}`;
  if (alMetro(a.um)) {
    const metri = Number.isFinite(n) && n > 0 ? Math.max(0.01, Math.round(n * 100) / 100) : 1;
    return {
      testoLibero: `${nome} — ${num(metri)} mt × ${euro(prezzo)} €/mt${estesa ? `\n${estesa}` : ""}`,
      quantita: 1,
      prezzoUnitario: Math.round(metri * prezzo * 100) / 100,
    };
  }
  return { testoLibero: `${nome}${estesa ? `\n${estesa}` : ""}`, quantita: Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : 1, prezzoUnitario: prezzo };
}
