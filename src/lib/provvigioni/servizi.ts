// «Servizi e pratiche» del listino e base delle provvigioni (richiesta di Ugo, nov 2026).
// I servizi a costo netto (pratica ENEA, autoscala, facchinaggio…) si vendono come prodotti ma NON entrano nella base su cui
// il commerciale prende la percentuale: dall'imponibile del contratto si toglie il loro importo. Ogni prodotto (modello) e ogni
// optional ha la spunta «va in provvigione» (di serie sì). Modulo puro: lo usano la rotta api/admin/seed-servizi, la pagina
// Contratti e i test (tests/provvigioni/servizi.test.ts).
import { cent } from "./calcoli";

export const FAMIGLIA_SERVIZI = "SERVIZI";
export const GRUPPO_SERVIZI = "SERVIZI E PRATICHE";
export const PREFISSO_SERVIZI = "SERVIZI_";

export type ServizioListino = { tipologia: string; nome: string; descrizione: string; immagine: string; varianti: { nome: string; prezzo: number }[] };

/** I servizi di partenza (prezzi netti, IVA a parte), presi dagli optional che c'erano nei listini. */
export const SERVIZI_LISTINO: ServizioListino[] = [
  {
    tipologia: "SERVIZI_ENEA", immagine: "/immagini/servizi/enea.svg", nome: "Pratica ENEA",
    descrizione: "Gestione e presentazione della pratica ENEA per le detrazioni fiscali: la seguiamo noi dall'inizio alla fine.",
    varianti: [{ nome: "Pratica ENEA (gestione e presentazione)", prezzo: 350 }],
  },
  {
    tipologia: "SERVIZI_AUTOSCALA", immagine: "/immagini/servizi/autoscala.svg", nome: "Autoscala",
    descrizione: "Noleggio dell'autoscala per portare il materiale ai piani alti quando non passa dalle scale.",
    varianti: [
      { nome: "Autoscala per la portata al piano", prezzo: 250 },
      { nome: "Autoscala dal 3° piano in su", prezzo: 500 },
      { nome: "Autoscala dal 7° piano in su", prezzo: 800 },
      { nome: "Autoscala su suolo pubblico senza parcheggio interno (in più)", prezzo: 300 },
    ],
  },
  {
    tipologia: "SERVIZI_FACCHINAGGIO", immagine: "/immagini/servizi/facchinaggio.svg", nome: "Facchinaggio",
    descrizione: "Movimentazione e trasporto a mano del materiale fino al piano (quantità = numero di piani).",
    varianti: [{ nome: "Facchinaggio al piano (per piano)", prezzo: 70 }],
  },
  // Voci aggiunte il 18/11/2026 (richiesta di Ugo, come su BConsole): i prezzi a 0 sono «da definire» e si scrivono dalla scheda del servizio
  // (Prodotti › listino › servizio): chi compila il listino può anche rinominare, aggiungere o togliere le voci.
  {
    tipologia: "SERVIZI_POSA", immagine: "/immagini/servizi/posa.svg", nome: "Posa in opera",
    descrizione: "Posa a regola d'arte con la nostra squadra: a corpo, a ore o a giornata.",
    varianti: [{ nome: "Posa a corpo", prezzo: 0 }, { nome: "Posa a ore (per ora)", prezzo: 0 }, { nome: "Posa a giornata (per giorno di squadra)", prezzo: 0 }],
  },
  {
    tipologia: "SERVIZI_TRASPORTO", immagine: "/immagini/servizi/trasporto.svg", nome: "Trasporto",
    descrizione: "Trasporto e consegna del materiale presso il cantiere.",
    varianti: [{ nome: "Trasporto e consegna (a corpo)", prezzo: 0 }, { nome: "Trasporto fuori zona (per km)", prezzo: 0 }],
  },
  {
    tipologia: "SERVIZI_ASSISTENZA", immagine: "/immagini/servizi/assistenza.svg", nome: "Assistenza tecnica",
    descrizione: "Intervento del nostro tecnico: costo di chiamata a uscita oppure a ore.",
    varianti: [{ nome: "Costo chiamata (a chiamata)", prezzo: 80 }, { nome: "Assistenza a orario (per ora)", prezzo: 80 }],
  },
];

/** Prodotti (righe del listino «a nome», senza misura) dei servizi. */
export function prodottiServizi(soloTipologie?: string[]) {
  return SERVIZI_LISTINO.filter((s) => !soloTipologie || soloTipologie.includes(s.tipologia)).flatMap((s) => s.varianti.map((v) => ({ tipologia: s.tipologia, colore: v.nome, larghezzaMm: 0, altezzaMm: 0, prezzoBase: v.prezzo })));
}

export const labelServizio = (tipologia: string) => SERVIZI_LISTINO.find((s) => s.tipologia === tipologia)?.nome ?? null;
export const immagineServizio = (tipologia: string) => SERVIZI_LISTINO.find((s) => s.tipologia === tipologia)?.immagine ?? null;
export const descrizioneServizio = (tipologia: string) => SERVIZI_LISTINO.find((s) => s.tipologia === tipologia)?.descrizione ?? null;

/** Optional dei vecchi listini che diventano servizi: escono dagli optional e dalla base delle provvigioni. */
export const eServizioDaSpostare = (nome: string) => /\benea\b|autoscala|facchinaggio/i.test(nome);

// ---------- base delle provvigioni ----------

export type RigaPerProvvigione = {
  quantita: number; prezzoUnitario: number; optionalPrezzo: number;
  /** il modello del prodotto della riga va in provvigione? (righe di testo: sì) */
  inProvvigione: boolean;
  optionali: { quantita: number; prezzoUnitario: number; inProvvigione: boolean }[];
};

/**
 * Quanto dell'offerta NON va in provvigione: le righe dei prodotti senza la spunta (con i loro optional) e, nelle altre righe,
 * gli optional senza la spunta. Si toglie per intero, al prezzo di listino (sono costi netti: lo sconto dell'offerta non li tocca).
 */
export function importoFuoriProvvigione(righe: RigaPerProvvigione[]): number {
  let fuori = 0;
  for (const r of righe) {
    const opt = r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
    if (!r.inProvvigione) fuori += r.quantita * r.prezzoUnitario + r.optionalPrezzo + opt;
    else fuori += r.optionali.filter((o) => !o.inProvvigione).reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
  }
  return cent(Math.max(0, fuori));
}

/** Base delle provvigioni = imponibile del contratto − servizi (mai sotto zero). */
export const baseProvvigione = (imponibile: number, servizi: number) => cent(Math.max(0, imponibile - Math.max(0, servizi)));
