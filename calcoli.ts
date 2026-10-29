// Acquisti: calcoli puri su ordini fornitori e righe (testati in tests/ordini).

export const STATI_ORDINE: { chiave: string; nome: string; colore: string }[] = [
  { chiave: "BOZZA", nome: "Bozza", colore: "#6b7280" },
  { chiave: "INVIATO", nome: "Inviato", colore: "#2563eb" },
  { chiave: "CONFERMATO", nome: "Confermato dal fornitore", colore: "#7c3aed" },
  { chiave: "EVASO_PARZIALE", nome: "Arrivato in parte", colore: "#d97706" },
  { chiave: "EVASO", nome: "Arrivato tutto", colore: "#16a34a" },
  { chiave: "ANNULLATO", nome: "Annullato", colore: "#dc2626" },
];
export const statoOrdine = (k: string) => STATI_ORDINE.find((s) => s.chiave === k) ?? { chiave: k, nome: k, colore: "#6b7280" };

export const CARTELLE: Record<string, string[]> = {
  CLIENTE: ["Generale", "Documenti identità", "Contratti firmati", "Pratiche e detrazioni", "Foto", "Corrispondenza"],
  PREVENTIVO: ["Generale", "Rilievi e disegni", "Offerte fornitori", "Foto", "Corrispondenza"],
  COMMESSA: ["Generale", "Conferme d'ordine fornitori", "DDT e bolle", "Fatture fornitori", "Foto", "Pratiche"],
  ORDINE_FORNITORE: ["Generale", "Conferma del fornitore", "DDT e bolle", "Fattura"],
  ARTICOLO: ["Foto", "Schede tecniche", "Certificazioni", "Istruzioni"],
  BOLLA_ENTRATA: ["Bolla", "Foto della merce", "Contestazioni"],
  FATTURA_ACQUISTO: ["Fattura", "Allegati"],
};
export const ENTITA_DOCUMENTI = Object.keys(CARTELLE);
export const MAX_DOCUMENTO = 4 * 1024 * 1024; // 4 MB per file

const cent = (n: number) => Math.round(n * 100) / 100;

export const numeroOrdine = (o: { numero: number; anno: number }) => `${o.numero}/${o.anno}`;

/** Prezzo netto unitario = prezzo × (1 − sconto%). */
export function prezzoNetto(prezzo: number | null | undefined, sconto: number | null | undefined): number | null {
  if (prezzo === null || prezzo === undefined) return null;
  return cent(prezzo * (1 - (sconto ?? 0) / 100));
}

/** Importo riga = quantità × prezzo netto. Null se manca il prezzo. */
export function importoRiga(r: { quantita: number; prezzoAcquisto?: number | null; scontoAcquisto?: number | null }): number | null {
  const n = prezzoNetto(r.prezzoAcquisto, r.scontoAcquisto);
  return n === null ? null : cent(n * r.quantita);
}

export function totaleOrdine(righe: { quantita: number; prezzoAcquisto?: number | null; scontoAcquisto?: number | null }[]) {
  const importi = righe.map(importoRiga);
  return { totale: cent(importi.reduce<number>((t, x) => t + (x ?? 0), 0)), righeSenzaPrezzo: importi.filter((x) => x === null).length };
}

/**
 * Costo previsto di una riga venduta: listino della riga (prezzo + optional) × quantità
 * meno lo sconto d'acquisto (del modello o, se manca, del fornitore). Null se lo sconto non è noto.
 */
export function costoPrevisto(r: { prezzoUnitario: number; optionalPrezzo?: number | null; quantita: number }, sconto: number | null | undefined): number | null {
  if (sconto === null || sconto === undefined) return null;
  return cent((r.prezzoUnitario + (r.optionalPrezzo ?? 0)) * r.quantita * (1 - sconto / 100));
}

/** Stato di evasione dell'ordine in base alle righe arrivate. */
export function statoDaArrivi(statoAttuale: string, righe: { arrivato: boolean }[]): string {
  if (statoAttuale === "ANNULLATO" || righe.length === 0) return statoAttuale;
  const arrivate = righe.filter((r) => r.arrivato).length;
  if (arrivate === righe.length) return "EVASO";
  if (arrivate > 0) return "EVASO_PARZIALE";
  return statoAttuale === "EVASO" || statoAttuale === "EVASO_PARZIALE" ? "CONFERMATO" : statoAttuale;
}

/** Nome file sicuro per download e allegati. */
export function nomeFileSicuro(nome: string): string {
  const pulito = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\- ()]+/g, "_").replace(/\s+/g, " ").trim();
  return (pulito || "documento").slice(0, 120);
}
