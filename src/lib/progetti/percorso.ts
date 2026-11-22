// Percorso guidato del progetto (richiesta di Ugo 16/11/2026, sul modello dei progetti di BConsole): dopo l'incasso dell'acconto si crea il
// progetto; dentro, in ordine: 1 appuntamento di rilievo → 2 caricamento rilievi → 3 prodotti e materiale (si conferma) → 4 ordini ai
// fornitori → 5 arrivo del materiale in magazzino. Le pratiche già avviate prima di questa funzione (`legacy`) non hanno il blocco
// degli ordini. Modulo puro.

export type DatiPercorso = {
  /** acconto incassato (o finanziamento approvato) */
  viaLibera: boolean;
  progettoCreatoIl: Date | null;
  materialeConfermatoIl: Date | null;
  /** pratica avviata prima del percorso guidato: niente blocchi */
  legacy: boolean;
  rilievi: { stato: string }[];
  /** righe del materiale da ordinare (esclusi i pezzi presi dalle scorte) */
  righe: number;
  righeSenzaFornitore: number;
  righeOrdinate: number;
  /** righe arrivate o prelevate dal magazzino, sul totale delle righe del materiale */
  righeArrivate: number;
  righeTotali: number;
  /** tutto il materiale è in magazzino (Commessa.materialeCompletoIl) */
  materialeCompleto: boolean;
};

export type PassoPercorso = {
  chiave: "RILIEVO_APPUNTAMENTO" | "RILIEVO_CARICATO" | "MATERIALE" | "ORDINI" | "ARRIVO";
  titolo: string;
  stato: "FATTO" | "ORA" | "IN_ATTESA";
  dettaglio: string;
  /** sezione della pagina della pratica */
  ancora: string;
};

export type Percorso = {
  fase: "DA_CREARE" | "IN_CORSO" | "COMPLETO";
  passi: PassoPercorso[];
  /** rilievo caricato e materiale con i fornitori: si può confermare il materiale */
  puoConfermare: boolean;
  /** gli ordini ai fornitori sono bloccati finché il materiale non è confermato */
  ordiniBloccati: boolean;
  etichetta: string;
};

/** Le pratiche già avviate (rilievo, materiale o ordini presenti) non hanno il blocco del percorso nuovo. */
export function praticaLegacy(d: { progettoCreatoIl: Date | null; rilievi: number; righe: number; ordini: number; ordineBC?: boolean }): boolean {
  // una pratica presa da BConsole è sempre «già avviata»: niente blocchi, anche se poi si è premuto «Crea progetto»
  if (d.ordineBC) return true;
  return !d.progettoCreatoIl && (d.rilievi > 0 || d.righe > 0 || d.ordini > 0);
}

export function percorsoProgetto(d: DatiPercorso): Percorso {
  const attivi = d.rilievi.filter((r) => r.stato !== "ANNULLATO");
  const fissato = attivi.length > 0;
  const caricato = attivi.some((r) => r.stato === "ESEGUITO");
  const materialeOk = d.righe > 0 && d.righeSenzaFornitore === 0;
  const confermato = !!d.materialeConfermatoIl;
  const puoConfermare = !confermato && caricato && materialeOk;
  const ordinato = confermato && d.righe > 0 && d.righeOrdinate >= d.righe;
  const arrivato = d.materialeCompleto;

  const stati = [fissato, caricato, confermato, ordinato, arrivato];
  const primo = stati.findIndex((x) => !x);
  const st = (i: number): PassoPercorso["stato"] => (stati[i] ? "FATTO" : i === primo ? "ORA" : "IN_ATTESA");
  const passi: PassoPercorso[] = [
    { chiave: "RILIEVO_APPUNTAMENTO", titolo: "Appuntamento di rilievo", stato: st(0), ancora: "#rilievo", dettaglio: fissato ? "Rilievo fissato nel calendario." : "Fissa giorno, ora e tecnico." },
    { chiave: "RILIEVO_CARICATO", titolo: "Caricamento rilievi", stato: st(1), ancora: "#rilievo", dettaglio: caricato ? "Misure e foto caricate." : "Carica misure, PDF e foto del rilievo." },
    {
      chiave: "MATERIALE", titolo: "Prodotti e materiale", stato: st(2), ancora: "#evasione",
      dettaglio: confermato ? `Materiale confermato (${d.righe} righe).`
        : d.righe === 0 ? "Aggiungi i prodotti e i complementi trovati al rilievo."
        : d.righeSenzaFornitore ? `${d.righeSenzaFornitore} righe senza fornitore: sceglilo.`
        : !caricato ? "Righe pronte: manca il rilievo caricato." : `${d.righe} righe pronte: conferma il materiale.`,
    },
    {
      chiave: "ORDINI", titolo: "Ordini ai fornitori", stato: st(3), ancora: "#evasione",
      dettaglio: !confermato ? "Si sbloccano quando confermi il materiale." : ordinato ? "Tutte le righe sono ordinate." : `${d.righeOrdinate} righe su ${d.righe} ordinate: crea e invia gli ordini.`,
    },
    {
      chiave: "ARRIVO", titolo: "Arrivo in magazzino", stato: st(4), ancora: "#evasione",
      dettaglio: arrivato ? "Tutto il materiale è in magazzino." : !ordinato ? "Si segna con le bolle in entrata." : `${d.righeArrivate} righe su ${d.righeTotali} arrivate.`,
    },
  ];

  if (!d.progettoCreatoIl && !d.legacy) {
    // il progetto lo crea Giorgia con la fattura di acconto (non aspetta più l'incasso: 18/11/2026); il rilievo aspetta progetto E acconto
    return { fase: "DA_CREARE", passi, puoConfermare: false, ordiniBloccati: true, etichetta: "Da creare" };
  }
  const etichetta = arrivato ? "Materiale in magazzino"
    : ordinato ? "Ordinato: in attesa del materiale"
    : confermato ? "Da ordinare"
    : puoConfermare ? "Pronto da confermare"
    : !fissato ? "Rilievo da fissare" : !caricato ? "Carica i rilievi" : "Completa il materiale";
  return { fase: arrivato ? "COMPLETO" : "IN_CORSO", passi, puoConfermare, ordiniBloccati: !confermato && !d.legacy, etichetta };
}
