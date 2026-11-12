import { puo, type ConPermessi } from "@/lib/permessi/catalogo";
// Un solo formato per tutto ciò che va in calendario: appuntamenti, rilievi, pose, interventi di assistenza.
import { chiaveGiorno, partiRoma, aggiungiGiorni } from "./tempo";

<<<<<<< HEAD
export type TipoEvento = "APPUNTAMENTO" | "RILIEVO" | "POSA" | "ASSISTENZA" | "RIUNIONE" | "ESTERNO";
=======
export type TipoEvento = "APPUNTAMENTO" | "RILIEVO" | "POSA" | "ASSISTENZA" | "RIUNIONE";
>>>>>>> origin/claude/clever-feynman-b637mq

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
  /** telefono del cliente, per la ricerca veloce del calendario */
  telefono?: string | null;
  utenteId?: string | null;
  chi?: string | null;
  stato: string;
  href: string;
  /** colore della persona incaricata (richiesta di Rocco: nel calendario il colore dice di chi è l'impegno, l'emoji il tipo) */
  colore?: string;
  chiaro?: string;
};

/** Colori delle persone del team: ben distinti fra loro (la tavolozza fissa dei grafici, allungata), assegnati in ordine. */
export const PALETTE_PERSONE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948", "#0e9f9a", "#a05a2c", "#7a8a00", "#c2389b"];

/** Versione chiara di un colore (sfondo delle schede): mescolato col bianco. */
export function schiarisci(hex: string, quanto = 0.82): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * quanto));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Colore di ogni persona (sempre lo stesso finché l'elenco del team non cambia): in ordine di nome. */
<<<<<<< HEAD
export function coloriPersone(persone: (string | { id: string; colore?: string | null })[]): Map<string, { colore: string; chiaro: string }> {
  // il colore scelto in Impostazioni › Utenti vince; gli altri prendono in ordine i colori della tavolozza non ancora usati
  const lista = persone.map((p) => (typeof p === "string" ? { id: p, colore: null } : p));
  const valido = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);
  const usati = new Set(lista.map((p) => valido(p.colore)).filter(Boolean));
  const liberi = PALETTE_PERSONE.filter((c) => !usati.has(c.toLowerCase()));
  let i = 0;
  return new Map(lista.map((p) => {
    const colore = valido(p.colore) ?? (liberi.length ? liberi[i++ % liberi.length] : PALETTE_PERSONE[i++ % PALETTE_PERSONE.length]);
    return [p.id, { colore, chiaro: schiarisci(colore) }];
  }));
}

const normalizza = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Ricerca veloce del calendario (la lente): tutte le parole devono trovarsi fra cliente, titolo, luogo (paese, città, via),
 *  note, incaricato e telefono; nei numeri contano solo le cifre («333 12 34» trova «3331234…»). */
export function cercaEventi(eventi: EventoCal[], q: string): EventoCal[] {
  const parole = normalizza(q).split(/\s+/).filter(Boolean);
  if (!parole.length) return [];
  return eventi.filter((e) => {
    const testo = normalizza([e.titolo, e.cliente, e.luogo, e.note, e.chi, e.telefono].filter(Boolean).join(" "));
    const cifre = testo.replace(/\D/g, "");
    const cifreQ = normalizza(q).replace(/\D/g, "");
    // ricerca di un numero di telefono (almeno 5 cifre e niente lettere): confronto sulle sole cifre
    if (cifreQ.length >= 5 && !/[a-z]/.test(normalizza(q))) return cifre.includes(cifreQ);
    return parole.every((w) => testo.includes(w));
  });
}

=======
export function coloriPersone(ids: string[]): Map<string, { colore: string; chiaro: string }> {
  return new Map(ids.map((id, i) => {
    const colore = PALETTE_PERSONE[i % PALETTE_PERSONE.length];
    return [id, { colore, chiaro: schiarisci(colore) }];
  }));
}

>>>>>>> origin/claude/clever-feynman-b637mq
/** Colori di un evento: quelli della persona se ci sono, altrimenti grigio. */
export const stileEvento = (e: EventoCal) => ({ colore: e.colore ?? "#737373", chiaro: e.chiaro ?? "#f5f5f5", icona: STILE_TIPO[e.tipo].icona, nome: STILE_TIPO[e.tipo].nome });

export const STILE_TIPO: Record<TipoEvento, { nome: string; colore: string; chiaro: string; icona: string }> = {
  APPUNTAMENTO: { nome: "Appuntamenti", colore: "#2563eb", chiaro: "#dbeafe", icona: "🤝" },
  RILIEVO: { nome: "Rilievi misure", colore: "#7c3aed", chiaro: "#ede9fe", icona: "📏" },
  POSA: { nome: "Pose", colore: "#ea580c", chiaro: "#ffedd5", icona: "🔧" },
  ASSISTENZA: { nome: "Assistenza", colore: "#0d9488", chiaro: "#ccfbf1", icona: "🛟" },
  RIUNIONE: { nome: "Riunioni", colore: "#525252", chiaro: "#f5f5f5", icona: "👥" },
<<<<<<< HEAD
  ESTERNO: { nome: "Da Nextcloud", colore: "#737373", chiaro: "#f5f5f5", icona: "🗓️" },
=======
>>>>>>> origin/claude/clever-feynman-b637mq
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
export const vedeTutti = (u: string | ConPermessi) => (typeof u === "string" ? !["COMMERCIALE", "POSATORE"].includes(u) : puo(u, "calendario.tutti"));
