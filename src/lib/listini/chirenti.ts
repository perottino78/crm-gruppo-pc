// Vetrate panoramiche con vetrocamera di CHIRENTI SRL (richiesta di Ugo, nov 2026): Book Pro Cam (a libro) e Solco Pro Cam (scorrevole).
// Prezzi ricavati dai preventivi Chirenti 90216/26-3694 (Book, vetrocamera temperato), 26-3694a (Book, stratificato) e 26-3694b
// (Solco, stratificato + serratura), tutti su una vetrata 2500 × 2400 mm (6 m²) con sconto fornitore 50%, imballo in casse di legno
// 200 € e trasporto in Piemonte 150 € a spedizione. Prezzo al m² = (listino × 50% + imballo e trasporto divisi sui 6 m² del
// riferimento) × ricarico. Dati del sito chirenti.it (descrizioni, foto, schede tecniche). Modulo puro: lo usano la rotta
// api/admin/seed-chirenti, la pagina dell'offerta e la scheda per il cliente.

export const SCONTO_CHIRENTI = 0.5; // sconto fornitore sul listino (VEPA ed altri sistemi / accessori: 50%)
export const IMBALLO_CHIRENTI = 200; // casse di legno con vetro, a spedizione
export const TRASPORTO_CHIRENTI = 150; // trasporto standard in Piemonte (con vostro muletto), a spedizione
export const MQ_RIFERIMENTO_CHIRENTI = 6; // 2500 × 2400 mm dei preventivi: imballo e trasporto spalmati su questi m²
export const RICARICO_CHIRENTI = 3.2; // vendita = costo × 3,2 (scelta di Ugo, 13/11/2026: come le porte a vetro, listino +60%); si cambia qui e si rilancia la rotta
/** Superficie minima fatturabile (m²) per tutti e due i sistemi: imballo e trasporto sono a spedizione, anche per una vetrata piccola. */
export const AREA_MINIMA_CHIRENTI = 3;

/** Listino Chirenti €/m² (prezzo pieno prima dello sconto) dai preventivi: 3.900 € e 3.270 € per 6 m². */
export const LISTINO_MQ_CHIRENTI = { TEMP: 650, STRAT: 545 } as const;
export type VetroChirenti = keyof typeof LISTINO_MQ_CHIRENTI;
export const VETRI_CHIRENTI: Record<VetroChirenti, string> = { TEMP: "Vetrocamera temperato", STRAT: "Vetrocamera stratificato" };

export type SistemaChirenti = {
  nome: string;
  gruppo: string;
  foto: string;
  spessore: number; // mm del vetrocamera
  testo: string;
  /** listini «certi» (preventivo ricevuto); gli altri sono stimati con la stessa differenza dell'altro sistema */
  daPreventivo: VetroChirenti[];
};
export const SISTEMI_CHIRENTI: Record<"BOOKPROCAM" | "SOLCOPROCAM", SistemaChirenti> = {
  BOOKPROCAM: {
    nome: "Book Pro Cam",
    gruppo: "VETRATE BOOK PRO CAM",
    foto: "/immagini/vetrate/book-pro-cam.jpg",
    spessore: 30,
    testo:
      "Vetrata panoramica a libro con vetrocamera basso emissiva da 30 mm, per chiudere balconi, verande e porticati da vivere tutto l'anno. " +
      "Profili verticali ermetici in alluminio a taglio termico, carrelli a doppio cuscinetto maggiorato (peso ripartito 50% sopra e 50% sotto), " +
      "scorrimento delle ante in linea e impacchettamento a libro con rotazione dei vetri a 110°, guarnizione impermeabile in EPDM, blocco antivento " +
      "in acciaio inox e profilo inferiore con salvagocce interno e drenaggio della condensa all'esterno.",
    daPreventivo: ["TEMP", "STRAT"],
  },
  SOLCOPROCAM: {
    nome: "Solco Pro Cam",
    gruppo: "VETRATE SOLCO PRO CAM",
    foto: "/immagini/vetrate/solco-pro-cam.jpg",
    spessore: 22,
    testo:
      "Vetrata panoramica scorrevole con vetrocamera da 22 mm, per verande, porticati e grandi aperture (altezza consigliata fino a 3 m). " +
      "Ante che scorrono in parallelo su binario inferiore a 4 vie con capsule in acciaio inox e si impacchettano di lato senza invadere gli spazi; " +
      "carrelli con ruote su cuscinetti in acciaio inox, profili intermedi e verticali ermetici in alluminio, maniglia sul profilo laterale. " +
      "Disponibile con profilo laterale slim, apertura centrale e apertura ad angolo retto.",
    daPreventivo: ["STRAT"],
  },
};
export type CodiceSistemaChirenti = keyof typeof SISTEMI_CHIRENTI;
export const PREFISSO_CHIRENTI = "VETRATA_";
export const tipologiaChirenti = (s: CodiceSistemaChirenti, v: VetroChirenti) => `VETRATA_${s}_${v}`;

const euro = (n: number) => Math.round(n * 100) / 100;
/** Costo P&C al m² (listino scontato + imballo e trasporto della spedizione divisi sui m² del riferimento). */
export const costoMqChirenti = (v: VetroChirenti) => euro(LISTINO_MQ_CHIRENTI[v] * (1 - SCONTO_CHIRENTI) + (IMBALLO_CHIRENTI + TRASPORTO_CHIRENTI) / MQ_RIFERIMENTO_CHIRENTI);
/** Prezzo di vendita al m², arrotondato all'euro. */
export const venditaMqChirenti = (v: VetroChirenti) => Math.round(costoMqChirenti(v) * RICARICO_CHIRENTI);

export function partiChirenti(tipologia: string): { sistema: CodiceSistemaChirenti; vetro: VetroChirenti } | null {
  const m = tipologia.match(/^VETRATA_(BOOKPROCAM|SOLCOPROCAM)_(TEMP|STRAT)$/);
  return m ? { sistema: m[1] as CodiceSistemaChirenti, vetro: m[2] as VetroChirenti } : null;
}
export const eChirenti = (tipologia: string) => partiChirenti(tipologia) !== null;

export function labelChirenti(tipologia: string): string | null {
  const p = partiChirenti(tipologia);
  return p ? `${SISTEMI_CHIRENTI[p.sistema].nome} — ${VETRI_CHIRENTI[p.vetro].toLowerCase()} ${SISTEMI_CHIRENTI[p.sistema].spessore} mm` : null;
}

export function descrizioneChirenti(tipologia: string): string | null {
  const p = partiChirenti(tipologia);
  if (!p) return null;
  const s = SISTEMI_CHIRENTI[p.sistema];
  return `${s.testo} Vetro: ${VETRI_CHIRENTI[p.vetro].toLowerCase()} da ${s.spessore} mm. ` +
    `PREZZO: ${venditaMqChirenti(p.vetro)} €/m² sulla superficie (larghezza e altezza arrotondate per eccesso ai 5 cm, minimo fatturabile ${AREA_MINIMA_CHIRENTI} m²), già compresi imballo in casse di legno e trasporto. ` +
    `Binari oltre 3 m: vengono tagliati, interi con supplemento di trasporto. Consegna del fornitore entro 30 giorni lavorativi dall'ordine.` +
    (s.daPreventivo.includes(p.vetro) ? "" : " Prezzo stimato (stessa differenza fra temperato e stratificato del Book Pro Cam): da confermare con Chirenti.");
}

/** Una riga «TARIFFA AL M²» per ogni sistema × vetro. */
export function prodottiChirenti() {
  return (Object.keys(SISTEMI_CHIRENTI) as CodiceSistemaChirenti[]).flatMap((s) =>
    (Object.keys(LISTINO_MQ_CHIRENTI) as VetroChirenti[]).map((v) => ({ tipologia: tipologiaChirenti(s, v), colore: "TARIFFA AL M²", larghezzaMm: 100, altezzaMm: 100, prezzoBase: venditaMqChirenti(v) })));
}

export type OptionalChirenti = { categoria: string; nome: string; tipoPrezzo: "FISSO"; valore: number; unita: string | null; gruppo: string };
/** Optional per sistema (gruppiApplicabili = gruppo del sistema). Prezzi di vendita = listino × 50% × ricarico. */
export function optionalChirenti(): OptionalChirenti[] {
  const o = (gruppo: string, categoria: string, nome: string, valore = 0, unita: string | null = null): OptionalChirenti => ({ categoria, nome, tipoPrezzo: "FISSO", valore, unita, gruppo });
  const book = SISTEMI_CHIRENTI.BOOKPROCAM.gruppo, solco = SISTEMI_CHIRENTI.SOLCOPROCAM.gruppo;
  return [
    o(book, "Colore", "Bianco RAL 9016 (di serie)"),
    o(book, "Colore", "Argento satinato (di serie)"),
    o(book, "Configurazione", "Impacchettamento ante all'interno"),
    o(book, "Configurazione", "Impacchettamento ante all'esterno"),
    o(book, "Configurazione", "Apertura a destra (vista interna)"),
    o(book, "Configurazione", "Apertura a sinistra (vista interna)"),
    o(book, "Accessori", "Maniglia S7/A bianca (di serie)"),
    o(solco, "Colore", "Bianco RAL 9016 (di serie)"),
    o(solco, "Colore", "Argento satinato (di serie)"),
    o(solco, "Colore", "Grigio micaceo (di serie)"),
    o(solco, "Configurazione", "Prima anta a sinistra (vista interna)"),
    o(solco, "Configurazione", "Prima anta a destra (vista interna)"),
    o(solco, "Configurazione", "Profilo laterale slim"),
    o(solco, "Accessori", "Serratura con cilindro passante (maniglie S7 interna ed esterna)", Math.round(120 * (1 - SCONTO_CHIRENTI) * RICARICO_CHIRENTI), "cad."),
  ];
}

/** Dati del fornitore dai preventivi (si scrivono solo nei campi vuoti della sua scheda). */
export const FORNITORE_CHIRENTI = {
  ragioneSociale: "CHIRENTI SRL",
  partitaIva: "05041370759",
  codiceFiscale: "05041370759",
  indirizzo: "Viale Risorgimento 9, Zona Artigianale",
  cap: "73020",
  comune: "Castri di Lecce",
  provincia: "LE",
  telefono: "0832 247890 - 392 5653400",
  email: "commerciale@chirenti.it",
  emailOrdini: "ordini@chirenti.it",
  banca: "Banca Sella - Agenzia di Castrì di Lecce (LE)",
  iban: "IT30Y0326879530052555395260",
  intestatario: "CHIRENTI S.R.L.",
  metodoPagamento: "Bonifico",
  condizioniPagamento: "Acconto con bonifico alla conferma d'ordine: mandare la contabile a ordini@chirenti.it",
  scontoFornitore: 50,
  listiniForniti: "Vetrate panoramiche: Book Pro Cam, Solco Pro Cam",
  note: "Preventivi a preventivi@chirenti.it. Consegna bordo strada, imballo in casse di legno (200 €) e trasporto Piemonte (150 €) a spedizione. " +
    "Binari oltre 3 m tagliati (interi con supplemento trasporto). Consegna max 30 giorni lavorativi dall'ordine. Offerte valide 15 giorni.",
};

/** Descrizioni brevi per il cliente (offerta stampata) e scheda tecnica (immagine dal sito chirenti.it, senza dati del fornitore). */
export const DESCRIZIONE_CLIENTE_BOOK = "Vetrata a libro Book Pro Cam: vetrocamera da 30 mm (temperato o stratificato), profili verticali in alluminio a taglio termico, " +
  "carrelli a doppio cuscinetto, ante che si impacchettano a libro ruotando a 110°, guarnizioni in EPDM e drenaggio della condensa verso l'esterno.";
export const DESCRIZIONE_CLIENTE_SOLCO = "Vetrata scorrevole Solco Pro Cam: vetrocamera da 22 mm (temperato o stratificato), ante su binario a 4 vie con capsule in acciaio inox, " +
  "carrelli con cuscinetti inox, profili ermetici in alluminio, impacchettamento laterale senza ingombri; altezza fino a 3 m.";
export const SCHEDE_CHIRENTI = {
  BOOKPROCAM: { chiave: "BOOKPROCAM", nome: "Scheda tecnica Book Pro Cam", pdf: "/cataloghi/book-pro-cam/book-pro-cam.pdf", cartella: "/cataloghi/book-pro-cam", pagine: 1, descrizione: DESCRIZIONE_CLIENTE_BOOK },
  SOLCOPROCAM: { chiave: "SOLCOPROCAM", nome: "Scheda tecnica Solco Pro Cam", pdf: "/cataloghi/solco-pro-cam/solco-pro-cam.pdf", cartella: "/cataloghi/solco-pro-cam", pagine: 1, descrizione: DESCRIZIONE_CLIENTE_SOLCO },
} as const;

export const GUIDA_CHIRENTI = `Prezzo al m² con imballo e trasporto compresi: scrivi larghezza e altezza del vano in cm (arrotondate ai 5 cm, minimo fatturabile ${AREA_MINIMA_CHIRENTI} m²). ` + +
  "Colori di serie senza sovrapprezzo; la serratura con cilindro (solo Solco) si aggiunge negli optional.";
