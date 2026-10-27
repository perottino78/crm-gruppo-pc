// Lettura delle prime note tenute a mano su foglio (Google Fogli / Excel esportato in CSV),
// nel formato dell'amministrazione: DATA | MOVIMENTO | RIF. FATTURA | CLIENTE / FORNITORE |
// BANCA ENTRATA | BANCA USCITA | TOTALE (progressivo) | eventuali colonne di appunti.
// Funzioni pure, testate in tests/amministrazione/foglio.test.ts.
import { leggiCsv, leggiImporto, leggiData, cent } from "./estratto";

export type RigaFoglio = {
  riga: number;
  data: Date;
  importo: number; // + entrata, - uscita
  tipo: string; // colonna MOVIMENTO
  rif: string; // colonna RIF. FATTURA
  controparte: string; // colonna CLIENTE / FORNITORE
  totale: number | null; // totale progressivo del foglio (null = riga non conteggiata nel saldo)
  appunti: string; // altre colonne (es. netto incassato dopo ritenuta)
};

export type EsitoFoglio = {
  ok: boolean;
  errore?: string;
  saldoIniziale: { importo: number; etichetta: string; data: Date | null } | null;
  movimenti: RigaFoglio[]; // righe con totale: già avvenute
  senzaTotale: RigaFoglio[]; // righe con importo ma senza totale: programmate o da verificare
  salti: { riga: number; atteso: number; foglio: number; differenza: number }[];
  saldoFinaleFoglio: number | null;
  saldoCalcolato: number | null;
  righeVuote: number;
};

const N = (s: string) => s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

/** Mappa colonne: accetta intestazione su una riga ("BANCA ENTRATA") o su due righe ("BANCA" sopra "ENTRATA"). */
function trovaColonne(tab: string[][]) {
  for (let i = 0; i < Math.min(tab.length, 15); i++) {
    const r = tab[i].map(N);
    if (!r.some((c) => c === "DATA" || c.startsWith("DATA ")) || !r.some((c) => c.startsWith("MOVIMENTO"))) continue;
    const sopra = i > 0 ? tab[i - 1].map(N) : [];
    // intestazione completa: sopra + sotto (es. "BANCA" + "ENTRATA")
    const h = r.map((c, k) => (/^(ENTRATA|USCITA)$/.test(c) && sopra[k] ? `${sopra[k]} ${c}` : c));
    const idx = (re: RegExp) => h.findIndex((c) => re.test(c));
    const col = {
      data: idx(/^DATA\b/), movimento: idx(/^MOVIMENTO/), rif: idx(/^RIF/), controparte: idx(/^CLIENTE|FORNITORE/),
      entrata: idx(/^BANCA ENTRATA/), uscita: idx(/^BANCA USCITA/), totale: idx(/^TOTALE/),
    };
    if (col.entrata < 0) col.entrata = h.findIndex((c) => c === "ENTRATA");
    if (col.uscita < 0) col.uscita = h.findIndex((c) => c === "USCITA");
    if (col.data < 0 || col.entrata < 0 || col.uscita < 0 || col.totale < 0) return null;
    const usate = Object.values(col);
    const appunti = h.map((c, k) => ({ c, k })).filter(({ k }) => !usate.includes(k));
    return { riga: i, col, appunti, intest: h };
  }
  return null;
}

export function leggiPrimaNotaFoglio(testo: string): EsitoFoglio {
  const vuoto: EsitoFoglio = { ok: false, saldoIniziale: null, movimenti: [], senzaTotale: [], salti: [], saldoFinaleFoglio: null, saldoCalcolato: null, righeVuote: 0 };
  if (!testo?.trim()) return { ...vuoto, errore: "Il file è vuoto." };
  const prima = testo.split(/\r?\n/).slice(0, 20).join("\n");
  const sep = [";", ",", "\t"].map((s) => ({ s, n: prima.split(s).length })).sort((a, b) => b.n - a.n)[0].s;
  const tab = leggiCsv(testo, sep);
  const m = trovaColonne(tab);
  if (!m) return { ...vuoto, errore: "Non trovo l'intestazione della prima nota: servono le colonne DATA, MOVIMENTO, ENTRATA e USCITA della banca, e TOTALE." };
  const { col } = m;
  const cell = (r: string[], k: number) => (k >= 0 ? (r[k] ?? "").trim() : "");
  let saldoIniziale: EsitoFoglio["saldoIniziale"] = null;
  const movimenti: RigaFoglio[] = [], senzaTotale: RigaFoglio[] = [], salti: EsitoFoglio["salti"] = [];
  let prec: number | null = null, righeVuote = 0;
  for (let i = m.riga + 1; i < tab.length; i++) {
    const r = tab[i];
    if (!r.some((c) => c.trim())) continue;
    const totale = leggiImporto(cell(r, col.totale));
    const e = leggiImporto(cell(r, col.entrata)) ?? 0, u = leggiImporto(cell(r, col.uscita)) ?? 0;
    const data = leggiData(cell(r, col.data));
    const tipo = cell(r, col.movimento);
    // prima riga con totale = saldo di apertura (anche se senza data o con etichetta vecchia)
    if (saldoIniziale === null && totale !== null && (!data || /saldo|apertura/i.test(tipo) || (e === 0 && u === 0))) {
      saldoIniziale = { importo: totale, etichetta: tipo || "saldo iniziale", data };
      prec = totale;
      continue;
    }
    const importo = cent(e - u);
    if (!data) { if (importo !== 0) righeVuote++; continue; }
    const appunti = m.appunti
      .map(({ c, k }) => ({ c, v: cell(r, k) }))
      .filter(({ v }) => v)
      .map(({ c, v }) => (c ? `${c.charAt(0) + c.slice(1).toLowerCase()}: ${v}` : v))
      .join(" · ");
    const riga: RigaFoglio = { riga: i + 1, data, importo, tipo, rif: cell(r, col.rif).replace(/\s+/g, " "), controparte: cell(r, col.controparte), totale, appunti };
    if (totale === null) {
      if (importo !== 0) senzaTotale.push(riga);
      continue;
    }
    if (prec !== null) {
      const atteso = cent(prec + importo);
      if (Math.abs(atteso - totale) > 0.005) salti.push({ riga: i + 1, atteso, foglio: totale, differenza: cent(totale - atteso) });
    }
    prec = totale;
    if (importo === 0) { righeVuote++; continue; }
    movimenti.push(riga);
  }
  if (!saldoIniziale) return { ...vuoto, errore: "Non trovo il saldo di apertura (prima riga con il TOTALE)." };
  const saldoCalcolato = cent(saldoIniziale.importo + movimenti.reduce((t, x) => t + x.importo, 0));
  return { ok: movimenti.length > 0, errore: movimenti.length ? undefined : "Nessun movimento trovato.", saldoIniziale, movimenti, senzaTotale, salti, saldoFinaleFoglio: prec, saldoCalcolato, righeVuote };
}

/** Descrizione del movimento nel CRM, con i campi del foglio. */
export function descrizioneRiga(r: Pick<RigaFoglio, "tipo" | "rif" | "controparte">): string {
  return [r.tipo, r.controparte, r.rif].filter(Boolean).join(" · ") || "(senza descrizione)";
}

/**
 * Classificazione automatica dai tipi usati in amministrazione. Restituisce la categoria
 * (il movimento risulta "registrato") oppure null (resta da abbinare a una scadenza).
 */
export function categoriaDaFoglio(r: Pick<RigaFoglio, "tipo" | "rif" | "controparte" | "importo">): string | null {
  const t = N(r.tipo), rif = N(r.rif), cp = N(r.controparte);
  if (/CESSION/.test(t)) return r.importo > 0 ? "Incassi da cessione crediti" : "Costi e commissioni per cessioni";
  if (/^COMMISSION|^SPESE/.test(t)) return "Commissioni e spese bancarie";
  if (/RITENUTA/.test(t)) return "Ritenute su bonifici con detrazione";
  if (/F24|PAGO ?PA|PAGOPA|^PAGAMENTO MAV|^MAV/.test(t)) return "F24 / imposte e contributi";
  if (/GIROCONTO/.test(t) || /GIROCONTO/.test(rif)) return "Giroconto fra conti";
  if (/STIPEND|TREDICESIM|QUATTORDICESIM/.test(rif) || /STIPEND/.test(t)) return "Stipendi e collaboratori";
  if (/PRELIEVO|VERSAMENTO CONTANT|USCITA CONTANTE/.test(t)) return "Prelievo / versamento contanti";
  if (/^INTERESSI/.test(t) || /INTERESSI/.test(rif)) return "Commissioni e spese bancarie";
  void cp;
  return null;
}
