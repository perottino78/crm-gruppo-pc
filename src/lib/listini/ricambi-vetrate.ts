// Accessori e ricambi delle vetrate (richiesta di Ugo 24/11/2026): articoli presi dalle schede prodotto di BConsole,
// stesso codice di BConsole (così un import successivo li riconosce e non fa doppioni). Dati puri, senza database.
// Per aggiungerne altri: una voce in RICAMBI_VETRATE e alza VERSIONE_RICAMBI_VETRATE.

export const VERSIONE_RICAMBI_VETRATE = "2026-11-24";
/** Albero delle categorie in Articoli (sotto «Complementi vetrate», nel listino OUTDOOR › VETRATE). */
export const CATEGORIA_MADRE = "Complementi vetrate";
export const CATEGORIA_RICAMBI = "Accessori e ricambi";

export type RicambioVetrata = {
  codice: string;
  descrizione: string;
  /** testo per il cliente (va nell'offerta sotto il nome) */
  descrizioneEstesa: string;
  /** sistema di vetrata (terzo livello: es. «Scorrevole parallelo») */
  sistema: string;
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
    sistema: "Scorrevole parallelo",
    um: "m",
    costo: 8.7,
    vendita: 24,
    immagine: "/immagini/ricambi-vetrate/2360.webp",
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
