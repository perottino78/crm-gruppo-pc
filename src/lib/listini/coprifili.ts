// Coprifili, angolari e listelli in PVC per la posa dei serramenti (richiesta di Ugo 18/11/2026: «mi serve solo il listino dei coprifili
// ed angolari, piatte da 30/60 ecc. con i colori, da aggiungere all'ordine fornitore»). Prezzi dal catalogo-listino EXTE 2023/2024
// (pubblico in rete; EXTE produce i profili per la posa compatibili con i sistemi Aluplast, Rehau, Veka, Salamander…), in euro per 100 m:
// colonne Bianco / Bianco con pellicola protettiva / Rivestito (pellicolato). Dati in prisma/seed-data/coprifili_exte.json
// (scripts/listini/estrai_coprifili_exte.py). Barre da 6 m, confezioni da 60 m (pellicolati da 60 m in su).
// Costo = listino EXTE al metro; vendita = costo × RICARICO_COPRIFILI (sul modello lo sconto d'acquisto equivalente, così negli ordini al
// fornitore il «costo previsto» è il prezzo EXTE). Si vende e si ordina AL METRO (come la lattoneria: lunghezza del pezzo in cm).
// Modulo puro: lo usano la rotta api/admin/seed-coprifili, il configuratore e i complementi della pratica.
import dati from "../../../prisma/seed-data/coprifili_exte.json";

export const PREFISSO_COPRIFILI = "COPRIF_";
// Ugo 22/11/2026: stanno in INDOOR › SERRAMENTI (sottogruppo PVC), scelti con due tendine: tipo di profilo → misura, poi colore e lunghezza.
export const GRUPPO_COPRIFILI = "SERRAMENTI";
export const SOTTOGRUPPO_COPRIFILI = "Coprifili PVC — Listino completo";
export const FORNITORE_COPRIFILI = "EXTE";
/** Vendita = costo EXTE × 2, come la lattoneria (da cambiare con gli Aumenti listini se serve). */
export const RICARICO_COPRIFILI = 2;
export const SCONTO_ACQUISTO_COPRIFILI = Math.round((1 - 1 / RICARICO_COPRIFILI) * 10000) / 100;

export type SezioneCoprifili =
  | "PIATTI" | "PIATTI_ADESIVI" | "PIEGABILI" | "SCATOLATI_SEPARABILI" | "SCATOLATI" | "SCATOLATI_ADESIVI" | "BAFFO" | "BAFFO_ADESIVI"
  | "ANGOLARI_UGUALI" | "ANGOLARI_DIVERSI";

/** Sottogruppi nella tendina dell'offerta, nell'ordine del catalogo. */
export const SOTTOGRUPPI_COPRIFILI: Record<SezioneCoprifili, string> = {
  PIATTI: "Coprifili piatti",
  PIATTI_ADESIVI: "Coprifili piatti adesivi",
  ANGOLARI_UGUALI: "Angolari a lati uguali",
  ANGOLARI_DIVERSI: "Angolari a lati diversi",
  PIEGABILI: "Listelli piegabili e flessibili",
  SCATOLATI: "Scatolati 7 mm",
  SCATOLATI_ADESIVI: "Scatolati 7 mm adesivi",
  BAFFO: "Scatolati 7 mm con baffo",
  BAFFO_ADESIVI: "Scatolati 7 mm con baffo adesivi",
  SCATOLATI_SEPARABILI: "Scatolati separabili e giunzioni",
};

export type ArticoloCoprifilo = {
  sezione: SezioneCoprifili;
  codice: string; // codice EXTE (anche codice fornitore del modello)
  descrizione: string;
  per100m: { bianco: number; protettiva: number | null; rivestito: number | null };
};
export const ARTICOLI_COPRIFILI = dati as ArticoloCoprifilo[];

export type FasciaColoreCoprifili = "BIANCO" | "PROTETTIVA" | "SALAMANDER" | "PELLICOLATO";
/** Colori proposti. I pellicolati hanno il sovrapprezzo EXTE della pellicola sul prezzo «Rivestito» (0%, 5%, 15%…);
 *  le altre pellicole del catalogo (oltre 270) con le voci «Altro colore pellicolato», scrivendo il colore nell'ordine. */
export const COLORI_COPRIFILI: { nome: string; fascia: FasciaColoreCoprifili; sovrapprezzo?: number }[] = [
  { nome: "Bianco", fascia: "BIANCO" },
  { nome: "Bianco con pellicola protettiva", fascia: "PROTETTIVA" },
  { nome: "Bianco Salamander (-5)", fascia: "SALAMANDER", sovrapprezzo: 15 },
  { nome: "Antracite RAL 7016 (AG)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Grigio basalto RAL 7012 (BG)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Grigio argento RAL 7001 (SG)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Grigio luce RAL 7035 (LG)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Grigio quarzo RAL 7039 (QG)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Grigio ardesia RAL 7015 liscio (SFG-V)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Grigio segnale RAL 7004 liscio (SIG)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Bianco RAL 9010 ultra opaco (WUM)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Crema RAL 9001 ultra opaco (CWUM)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Nero RAL 9011 ultra opaco (BUM)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Golden Oak (Q)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Noce (NB)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Douglas striato (Y)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Mogano (GK)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Sapeli (G)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Rovere scuro (L)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Rovere palude (F)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Oregon (W)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Pino montano (Z)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Verde muschio RAL 6005 (MG)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Verde scuro RAL 6009 (TG)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Blu acciaio RAL 5011 (SB)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Marrone cioccolato RAL 8019 (M)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Marrone scuro RAL 8022 (J)", fascia: "PELLICOLATO", sovrapprezzo: 0 },
  { nome: "Rovere chiaro (K)", fascia: "PELLICOLATO", sovrapprezzo: 5 },
  { nome: "Rovere naturale (EH)", fascia: "PELLICOLATO", sovrapprezzo: 5 },
  { nome: "Rovere rustico (E)", fascia: "PELLICOLATO", sovrapprezzo: 5 },
  { nome: "Ciliegio nero (BC)", fascia: "PELLICOLATO", sovrapprezzo: 5 },
  { nome: "Macorè (MC)", fascia: "PELLICOLATO", sovrapprezzo: 5 },
  { nome: "Rosso vino RAL 3005 (WR)", fascia: "PELLICOLATO", sovrapprezzo: 15 },
  { nome: "Winchester (WIN-C)", fascia: "PELLICOLATO", sovrapprezzo: 15 },
  { nome: "Crema RAL 9001 (CWP)", fascia: "PELLICOLATO", sovrapprezzo: 15 },
  // Ugo 22/11/2026: pellicole super opache (gamma a stock, goffratura 102201), fascia «pellicolato +20%».
  { nome: "Amaranth Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Cayenne Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Chia Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Cinnamon Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Coriander Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Crystal White 9294 super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Ginger Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Grey Amanita Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Honey Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Loire Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Nutmeg Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Pepper Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Sesame Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Truffle Oak super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Weissbach Eiche super opaco", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Altro colore pellicolato +15% (scrivi il colore)", fascia: "PELLICOLATO", sovrapprezzo: 15 },
  { nome: "Altro colore pellicolato +20% (scrivi il colore)", fascia: "PELLICOLATO", sovrapprezzo: 20 },
  { nome: "Altro colore pellicolato +50% (scrivi il colore)", fascia: "PELLICOLATO", sovrapprezzo: 50 },
];

export const tipologiaCoprifilo = (codice: string) => `${PREFISSO_COPRIFILI}${codice}`;
const perTipologia = new Map(ARTICOLI_COPRIFILI.map((a) => [tipologiaCoprifilo(a.codice), a]));
export const articoloCoprifilo = (tipologia: string) => (tipologia.startsWith(PREFISSO_COPRIFILI) ? perTipologia.get(tipologia) ?? null : null);
export const eCoprifilo = (tipologia: string) => tipologia.startsWith(PREFISSO_COPRIFILI);

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Costo EXTE al metro per il colore, o null se l'articolo non esiste in quel colore. */
export function costoCoprifiloAlMetro(a: ArticoloCoprifilo, c: (typeof COLORI_COPRIFILI)[number]): number | null {
  const p = a.per100m;
  const base = c.fascia === "BIANCO" || c.fascia === "SALAMANDER" ? p.bianco : c.fascia === "PROTETTIVA" ? p.protettiva : p.rivestito;
  if (base == null) return null;
  return r2((base / 100) * (1 + (c.sovrapprezzo ?? 0) / 100));
}

/** Nome della variante (lo vede anche il cliente: niente prezzi del fornitore). */
// Ugo 22/11/2026: sono barre da 6000 mm e si compra la barra intera (il listino EXTE è al metro): il prezzo della variante è PER BARRA = prezzo al metro × 6.
export const LUNGHEZZA_BARRA_M = 6;
export const coloreCoprifilo = (nome: string) => `${nome} — barra da 6 m`;

export function catalogoCoprifili(ricarico = RICARICO_COPRIFILI) {
  const prodotti = ARTICOLI_COPRIFILI.flatMap((a) =>
    COLORI_COPRIFILI.flatMap((c) => {
      const costo = costoCoprifiloAlMetro(a, c);
      return costo == null ? [] : [{ tipologia: tipologiaCoprifilo(a.codice), colore: coloreCoprifilo(c.nome), larghezzaMm: 0, altezzaMm: 0, prezzoBase: r2(costo * LUNGHEZZA_BARRA_M * ricarico) }];
    }));
  const modelli = ARTICOLI_COPRIFILI.map((a) => ({
    tipologia: tipologiaCoprifilo(a.codice),
    codiceFornitore: a.codice,
    sottogruppo: SOTTOGRUPPO_COPRIFILI,
    descrizioneTecnica:
      `${nomeCoprifilo(a)}: profilo in PVC per la posa dei serramenti (per esterni ed interni), barre da 6 m, confezioni da 60 m. ` +
      `Si vende a barra intera da 6 m (6000 mm): il prezzo è per barra (prezzo al metro × 6). Colori: bianco${a.per100m.protettiva != null ? ", bianco con pellicola protettiva" : ""}, bianco Salamander` +
      (a.per100m.rivestito != null ? ", pellicolato in tinta unita o effetto legno (pellicolati da 60 m in su)." : "; pellicolato non disponibile a catalogo."),
  }));
  return { prodotti, modelli };
}

export const sottogruppoCoprifilo = (tipologia: string) => (articoloCoprifilo(tipologia) ? SOTTOGRUPPO_COPRIFILI : null);

/** Le due tendine: «Tipo di profilo» (coprifilo piatto, angolare…) e «Misura». */
export function assiSelezioneCoprifili(tipologia: string): { modello: { valore: string; label: string }; apertura: { valore: string; label: string } } | null {
  const a = articoloCoprifilo(tipologia);
  if (!a) return null;
  const misura = nomeCoprifilo(a).replace(/^(Coprifilo|Listello|Angolare|Scatolato)[^0-9]*?(?=\d)/i, "").trim() || nomeCoprifilo(a);
  return { modello: { valore: a.sezione, label: SOTTOGRUPPI_COPRIFILI[a.sezione] }, apertura: { valore: a.codice, label: misura } };
}
/** Nome leggibile (offerta, ricerca dei complementi): «Coprifilo piatto 30 x 2,5» al posto di «Listello piatto…», con il codice EXTE. */
export const nomeCoprifilo = (a: ArticoloCoprifilo) =>
  `${a.descrizione.replace(/^Listello (piatto|scatolato)/, "Coprifilo $1").replace(/^Listello (piegabile|flessibile)/, "Coprifilo $1")} (EXTE ${a.codice})`;
export const labelCoprifilo = (tipologia: string) => {
  const a = articoloCoprifilo(tipologia);
  return a ? nomeCoprifilo(a) : null;
};

export const GUIDA_COPRIFILI =
  "Coprifili e angolari EXTE in barre da 6 m (6000 mm): si compra la barra intera, il prezzo mostrato è per barra (listino al metro × 6). Scrivi quante barre. Nell'ordine al fornitore il costo previsto è il " +
  "listino EXTE; per un pellicolato non in elenco scegli «Altro colore pellicolato» e scrivi il colore.";
