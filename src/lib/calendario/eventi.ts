// Un solo formato per tutto ciò che va in calendario: appuntamenti, rilievi, pose, interventi di assistenza.
import { chiaveGiorno, partiRoma, aggiungiGiorni } from "./tempo";

export type TipoEvento = "APPUNTAMENTO" | "RILIEVO" | "POSA" | "ASSISTENZA";

export type EventoCal = {
  id: string; // es. "APPUNTAMENTO:abc"
  tipo: TipoEvento;
  sottotipo?: string | null;
  inizio: Date;
  fine: Date;
  giornataIntera: boolean;
  titolo: string;
  cliente?: string | null;
  luogo?: string | null;
  note?: string | null;
  utenteId?: string | null;
  chi?: string | null;
  stato: string;
  href: string;
};

export const STILE_TIPO: Record<TipoEvento, { nome: string; colore: string; chiaro: string; icona: string }> = {
  APPUNTAMENTO: { nome: "Appuntamenti", colore: "#2563eb", chiaro: "#dbeafe", icona: "🤝" },
  RILIEVO: { nome: "Rilievi misure", colore: "#7c3aed", chiaro: "#ede9fe", icona: "📏" },
  POSA: { nome: "Pose", colore: "#ea580c", chiaro: "#ffedd5", icona: "🔧" },
  ASSISTENZA: { nome: "Assistenza", colore: "#0d9488", chiaro: "#ccfbf1", icona: "🛟" },
};

export const TIPI_APPUNTAMENTO = [
  { chiave: "COMMERCIALE", nome: "Visita commerciale" },
  { chiave: "SOPRALLUOGO", nome: "Sopralluogo" },
  { chiave: "FIRMA", nome: "Firma contratto" },
  { chiave: "CONSEGNA", nome: "Consegna" },
  { chiave: "TELEFONICO", nome: "Telefonata / videochiamata" },
  { chiave: "ALTRO", nome: "Altro" },
];
export const nomeTipoAppuntamento = (k: string) => TIPI_APPUNTAMENTO.find((t) => t.chiave === k)?.nome ?? k;

export const STATI_CHIUSI = ["ANNULLATO", "ANNULLATA", "COMPLETATO", "ESEGUITO", "COMPLETATA", "RISOLTA"];
export const annullato = (e: EventoCal) => /^ANNULLAT/.test(e.stato);

/** Giorni (chiavi Roma) toccati dall'evento */
export function giorniEvento(e: EventoCal): string[] {
  const out: string[] = [];
  let g = chiaveGiorno(e.inizio);
  const ultimo = chiaveGiorno(new Date(e.fine.getTime() - 1));
  for (let i = 0; i < 62 && g <= ultimo; i++) {
    out.push(g);
    g = aggiungiGiorni(g, 1);
  }
  return out.length ? out : [chiaveGiorno(e.inizio)];
}

export type Posizionato = { e: EventoCal; top: number; altezza: number; colonna: number; colonne: number };

/**
 * Impagina gli eventi a orario di un giorno nella griglia ore (ORA_INIZIO-ORA_FINE): minuti dall'inizio
 * e corsie affiancate quando due appuntamenti si sovrappongono.
 */
export function impagina(eventi: EventoCal[], oraInizio: number, oraFine: number): Posizionato[] {
  const min = (d: Date) => {
    const p = partiRoma(d);
    return p.ora * 60 + p.minuto;
  };
  const items = eventi
    .filter((e) => !e.giornataIntera)
    .map((e) => {
      const a = Math.max(oraInizio * 60, min(e.inizio));
      const b = Math.min(oraFine * 60, Math.max(a + 30, min(e.fine) || a + 60));
      return { e, a, b };
    })
    .sort((x, y) => x.a - y.a || y.b - x.b);
  const out: Posizionato[] = [];
  let gruppo: { e: EventoCal; a: number; b: number; col: number }[] = [];
  let fineGruppo = -1;
  const chiudi = () => {
    const n = Math.max(1, ...gruppo.map((g) => g.col + 1));
    for (const g of gruppo) out.push({ e: g.e, top: g.a - oraInizio * 60, altezza: g.b - g.a, colonna: g.col, colonne: n });
    gruppo = [];
  };
  for (const it of items) {
    if (gruppo.length && it.a >= fineGruppo) chiudi();
    const occupate = new Set(gruppo.filter((g) => g.b > it.a).map((g) => g.col));
    let col = 0;
    while (occupate.has(col)) col++;
    gruppo.push({ ...it, col });
    fineGruppo = Math.max(fineGruppo, it.b);
  }
  if (gruppo.length) chiudi();
  return out;
}

/** Chi può vedere e organizzare il calendario di tutti: tutti tranne commerciali e posatori, che vedono il proprio */
export const vedeTutti = (ruolo: string) => !["COMMERCIALE", "POSATORE"].includes(ruolo);
