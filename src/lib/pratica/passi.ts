// Percorso guidato della pratica (richiesta di Ugo, 18/11/2026): le operazioni dalla conferma d'ordine al kit sono in sequenza; la pagina
// della pratica mostra SOLO il passo in corso (o uno già fatto che si vuole rivedere o modificare) e non le schermate dei passi dopo finché
// quello attuale non è salvato. Modulo puro: decide stato e passo corrente dai dati della pratica.

export type ChiavePasso =
  | "FATTURA" | "PROGETTO" | "BENVENUTO" | "INCASSO" | "RILIEVO_APP" | "RILIEVO" | "MATERIALE" | "ARRIVO" | "SALDO" | "POSA_APP" | "POSA" | "KIT";

export type DatiPassi = {
  fatturaAccontoIl: Date | null;
  progettoCreatoIl: Date | null;
  benvenutoIl: Date | null;
  /** acconto incassato (o finanziamento approvato) */
  viaLibera: boolean;
  rilievoFissato: boolean;
  rilievoCaricato: boolean;
  /** tutte le righe del materiale ordinate ai fornitori */
  ordinato: boolean;
  materialeCompleto: boolean;
  saldoIncassato: boolean;
  posaFissata: boolean;
  posaFinita: boolean;
  kitConsegnato: boolean;
};

export type StatoPasso = "FATTO" | "ORA" | "IN_ATTESA";

export type PassoPratica = {
  chiave: ChiavePasso;
  titolo: string;
  /** chi lo fa (ufficio) */
  chi: string;
  stato: StatoPasso;
  /** si fa in parallelo agli altri (incasso, saldo): non blocca il passo dopo da solo */
  parallelo: boolean;
  /** cosa serve per poter iniziare (se in attesa) o cosa fare (se ora) */
  nota: string;
};

type Def = { chiave: ChiavePasso; titolo: string; chi: string; parallelo: boolean };
const DEF: Def[] = [
  { chiave: "FATTURA", titolo: "Fattura di acconto", chi: "Fatturazione (Giorgia)", parallelo: false },
  { chiave: "PROGETTO", titolo: "Creazione del progetto", chi: "Fatturazione (Giorgia)", parallelo: false },
  { chiave: "BENVENUTO", titolo: "Chiamata di benvenuto", chi: "Fatturazione (Giorgia)", parallelo: false },
  { chiave: "INCASSO", titolo: "Incasso dell'acconto", chi: "Amministrazione (Debora)", parallelo: true },
  { chiave: "RILIEVO_APP", titolo: "Appuntamento di rilievo", chi: "Centralino (Alessia)", parallelo: false },
  { chiave: "RILIEVO", titolo: "Rilievo eseguito", chi: "Tecnico", parallelo: false },
  { chiave: "MATERIALE", titolo: "Materiale e ordini", chi: "Ufficio ordini (Laura)", parallelo: false },
  { chiave: "ARRIVO", titolo: "Arrivo in magazzino", chi: "Magazzino", parallelo: false },
  { chiave: "SALDO", titolo: "Fattura e incasso del saldo", chi: "Fatturazione (Giorgia)", parallelo: true },
  { chiave: "POSA_APP", titolo: "Appuntamento di posa", chi: "Centralino (Alessia)", parallelo: false },
  { chiave: "POSA", titolo: "Posa e fine lavori", chi: "Squadra e centralino", parallelo: false },
  { chiave: "KIT", titolo: "Kit di manutenzione", chi: "Commerciale", parallelo: false },
];

export const CHIAVI_PASSI: ChiavePasso[] = DEF.map((d) => d.chiave);

/**
 * Stato di ogni passo. Un passo è fatto se lo dice il suo dato oppure se è già fatto un passo successivo (le pratiche avviate prima del
 * percorso non restano ferme su passi che non hanno mai avuto). Incasso e saldo sono in parallelo: non decidono il passo corrente.
 */
export function passiPratica(d: DatiPassi): { passi: PassoPratica[]; corrente: ChiavePasso | null } {
  const raw: Record<ChiavePasso, boolean> = {
    FATTURA: !!d.fatturaAccontoIl, PROGETTO: !!d.progettoCreatoIl, BENVENUTO: !!d.benvenutoIl, INCASSO: d.viaLibera,
    RILIEVO_APP: d.rilievoFissato, RILIEVO: d.rilievoCaricato, MATERIALE: d.ordinato, ARRIVO: d.materialeCompleto, SALDO: d.saldoIncassato,
    POSA_APP: d.posaFissata, POSA: d.posaFinita, KIT: d.kitConsegnato,
  };
  const sequenza = DEF.filter((x) => !x.parallelo);
  // fatto = dato proprio oppure un passo della sequenza più avanti è fatto
  const fatto = (c: ChiavePasso): boolean => {
    if (raw[c]) return true;
    const def = DEF.find((x) => x.chiave === c)!;
    if (def.parallelo) return false;
    const i = sequenza.findIndex((x) => x.chiave === c);
    return sequenza.slice(i + 1).some((x) => raw[x.chiave]);
  };
  const corrente = sequenza.find((x) => !fatto(x.chiave))?.chiave ?? null;
  const passi = DEF.map((x): PassoPratica => {
    const f = fatto(x.chiave);
    const stato: StatoPasso = f ? "FATTO" : x.chiave === corrente ? "ORA" : x.parallelo ? (x.chiave === "INCASSO" ? "ORA" : d.ordinato ? "ORA" : "IN_ATTESA") : "IN_ATTESA";
    return { chiave: x.chiave, titolo: x.titolo, chi: x.chi, parallelo: x.parallelo, stato, nota: notaPasso(x.chiave, f, d) };
  });
  return { passi, corrente };
}

function notaPasso(c: ChiavePasso, fatto: boolean, d: DatiPassi): string {
  if (fatto) return "Fatto.";
  switch (c) {
    case "FATTURA": return "Emetti la fattura di acconto, poi segnala che è fatta.";
    case "PROGETTO": return "Crea il progetto della pratica.";
    case "BENVENUTO": return "Chiama il cliente per dargli il benvenuto e annota com'è andata.";
    case "INCASSO": return "Registra il pagamento dell'acconto (o il finanziamento approvato). Parte il ringraziamento al cliente.";
    case "RILIEVO_APP": return !d.viaLibera ? "Serve l'acconto incassato: poi si fissa il rilievo." : !d.progettoCreatoIl ? "Serve il progetto creato." : "Scegli rilevatore, giorno e ora.";
    case "RILIEVO": return "Il tecnico carica misure, PDF e foto del rilievo.";
    case "MATERIALE": return "Controlla i prodotti, conferma il materiale e ordina ai fornitori.";
    case "ARRIVO": return "Il magazzino carica bolle e fatture del materiale in arrivo.";
    case "SALDO": return "Emetti la fattura di saldo e registra l'incasso: con il saldo si conferma il giorno di posa.";
    case "POSA_APP": return "Scegli squadra, giorno e giorni previsti.";
    case "POSA": return "La squadra posa; il centralino carica i documenti e segna Finita o Parziale.";
    case "KIT": return "Il commerciale consegna il kit di manutenzione e lo registra.";
  }
}

/** Passo da mostrare: quello richiesto (se già fatto o in parallelo, quindi rivedibile) altrimenti il corrente. */
export function passoDaMostrare(passi: PassoPratica[], corrente: ChiavePasso | null, richiesto?: string | null): ChiavePasso | null {
  const r = passi.find((p) => p.chiave === richiesto);
  if (r && (r.stato === "FATTO" || r.parallelo || r.chiave === corrente)) return r.chiave;
  return corrente ?? passi[passi.length - 1]?.chiave ?? null;
}

/** Passo precedente nella sequenza (per «← Torna al passo prima»), saltando quelli in parallelo. */
export function passoPrecedente(passi: PassoPratica[], chiave: ChiavePasso): PassoPratica | null {
  const seq = passi.filter((p) => !p.parallelo);
  const i = seq.findIndex((p) => p.chiave === chiave);
  return i > 0 ? seq[i - 1] : null;
}
