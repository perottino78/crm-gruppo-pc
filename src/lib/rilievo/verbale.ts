// Verbale di sopralluogo e rilievo misure (modulo cartaceo «Verbale_Sopralluogo_PEC v3», Rev. 1.0 — 2026), compilato al «Carica rilievo».
// Parte pura (senza DB): le sezioni con le spunte, la lettura dal modulo e le righe dei prodotti da installare.

export type CampoVerbale =
  | { k: string; tipo: "testo"; label: string }
  | { k: string; tipo: "area"; label: string }
  | { k: string; tipo: "spunte"; label: string; opzioni: string[] };

export type SezioneVerbale = { id: string; titolo: string; campi: CampoVerbale[] };

/** Sezioni 2-5 e 7 del verbale (la 1 si precompila dal CRM, la 6 è la tabella dei prodotti). */
export const SEZIONI_VERBALE: SezioneVerbale[] = [
  { id: "tipo", titolo: "2 — Tipo di intervento", campi: [
    { k: "intervento", tipo: "spunte", label: "Barra tutto ciò che è applicabile", opzioni: ["Serramenti PVC", "Serramenti Alluminio", "Porte Interne", "Portoni / Blindate", "Pergola Bioclimatica", "Pergola Semplice", "Vetrata Panoramica (VP)", "Tenda da Sole", "Tapparelle", "Zanzariere", "Cassonetti", "Accessori / Extra"] },
    { k: "intervento_altro", tipo: "testo", label: "Altro / Precisazioni" },
  ] },
  { id: "edificio", titolo: "3 — Dati edificio e accessi", campi: [
    { k: "piano", tipo: "testo", label: "Piano di intervento" },
    { k: "piani_totali", tipo: "testo", label: "N. piani totali edificio" },
    { k: "anno_costruzione", tipo: "testo", label: "Anno costruzione (approx.)" },
    { k: "accessi", tipo: "spunte", label: "Accessi", opzioni: ["Ascensore presente", "Ascensore idoneo al materiale", "Scale interne", "Accesso diretto da esterno"] },
    { k: "dim_ascensore", tipo: "testo", label: "Dimensioni ascensore (L × P × H)" },
    { k: "larghezza_scala", tipo: "testo", label: "Larghezza vano scala" },
    { k: "mezzi", tipo: "spunte", label: "Mezzi", opzioni: ["Autoscala possibile", "Posiz. autoscala: fronte facciata", "Spazio mezzi pesanti", "Accesso cortile / giardino"] },
    { k: "dettagli_autoscala", tipo: "testo", label: "Dettagli posizionamento autoscala / accesso cantiere" },
    { k: "rif_condominio", tipo: "testo", label: "Riferimento Ufficio Tecnico / Condominio (nome, telefono)" },
  ] },
  { id: "stato", titolo: "4 — Stato dell'immobile al momento del rilievo", campi: [
    { k: "pareti", tipo: "spunte", label: "Pareti e superfici", opzioni: ["Macchie / umidità", "Crepe / lesioni", "Tinteggiatura da rifare", "Intonaco mancante", "Normale usura", "Buono stato", "Da risanare", "Appena tinteggiato"] },
    { k: "pavimenti", tipo: "spunte", label: "Pavimenti / Parquet", opzioni: ["Rigato / segnato", "Rotto / scheggiato", "Parquet vecchio", "Parquet nuovo/recente", "Piastrelle normali", "Buono stato", "Soglie da sostituire"] },
    { k: "balconi", tipo: "spunte", label: "Balconi / Terrazzi", opzioni: ["Balcone presente", "Ringhiera ammalorata", "Pavimento sconnesso", "Infiltrazioni", "Umidità / muffa visibile", "Già rinnovato", "Buono stato"] },
    { k: "infissi", tipo: "spunte", label: "Infissi / cassonetti esistenti", opzioni: ["Legno vecchio", "Alluminio vecchio", "PVC esistente", "Cassonetti in muratura", "Cassonetti coibentati", "Davanzali da rifare", "Guarnizioni deteriorate"] },
    { k: "note_stato", tipo: "area", label: "Note sullo stato dell'immobile (criticità, segnalazioni, elementi da documentare)" },
  ] },
  { id: "posa", titolo: "5 — Pianificazione della posa", campi: [
    { k: "data_posa", tipo: "testo", label: "Data prevista posa" },
    { k: "ore_stimate", tipo: "testo", label: "Ore stimate totali" },
    { k: "operatori", tipo: "testo", label: "N. operatori necessari" },
    { k: "trasporto", tipo: "spunte", label: "Modalità trasporto materiale al piano", opzioni: ["Scala a mano", "Ascensore", "Autoscala esterna", "Gruetta / montacarichi", "Accesso diretto piano terra", "Altro (vedi note)"] },
    { k: "smaltimento", tipo: "spunte", label: "Smaltimento infissi / materiali vecchi", opzioni: ["A carico P&C (incluso)", "A carico cliente", "Lasciati in loco su richiesta", "Da concordare"] },
    { k: "orario_accesso", tipo: "testo", label: "Orario di accesso consentito al cantiere" },
    { k: "restrizioni", tipo: "testo", label: "Restrizioni (ZTL, permesso parcheggio, orari rumore, ecc.)" },
    { k: "note_logistiche", tipo: "area", label: "Note logistiche e organizzative" },
  ] },
  { id: "finali", titolo: "7 — Segnalazioni particolari e note finali", campi: [
    { k: "note_finali", tipo: "area", label: "Segnalazioni particolari (lavorazioni speciali, piano di lavorazione, cose da ricordare)" },
  ] },
];

export type RigaProdotto = { tipo: string; larg: string; alt: string; q: string; note: string };
export type Verbale = { campi: Record<string, string | string[]>; righe: RigaProdotto[]; rif_interno?: string };

export const MAX_RIGHE_PRODOTTI = 40;

const pulisci = (s: string | null | undefined, max = 600) => (s ?? "").replace(/\s+\n/g, "\n").trim().slice(0, max);

/** Legge il modulo: i testi `v_<k>`, le spunte (più valori con lo stesso nome) e le righe `vr_<n>_<tipo|larg|alt|q|note>`. */
export function verbaleDaForm(get: (k: string) => string | null, getAll: (k: string) => string[]): Verbale {
  const campi: Record<string, string | string[]> = {};
  for (const s of SEZIONI_VERBALE) for (const c of s.campi) {
    if (c.tipo === "spunte") {
      const ok = new Set(c.opzioni);
      const scelti = [...new Set(getAll(`v_${c.k}`).filter((x) => ok.has(x)))];
      if (scelti.length) campi[c.k] = scelti;
    } else {
      const t = pulisci(get(`v_${c.k}`), c.tipo === "area" ? 4000 : 300);
      if (t) campi[c.k] = t;
    }
  }
  const righe: RigaProdotto[] = [];
  for (let i = 1; i <= MAX_RIGHE_PRODOTTI; i++) {
    const r = { tipo: pulisci(get(`vr_${i}_tipo`), 200), larg: pulisci(get(`vr_${i}_larg`), 20), alt: pulisci(get(`vr_${i}_alt`), 20), q: pulisci(get(`vr_${i}_q`), 10), note: pulisci(get(`vr_${i}_note`), 300) };
    if (r.tipo || r.larg || r.alt || r.note) righe.push(r);
  }
  const rif = pulisci(get("v_rif_interno"), 100);
  return { campi, righe, ...(rif ? { rif_interno: rif } : {}) };
}

/** Il verbale è stato compilato (almeno una spunta, un testo o una riga)? */
export const verbaleCompilato = (v: Verbale | null | undefined) => !!v && (Object.keys(v.campi).length > 0 || v.righe.length > 0 || !!v.rif_interno);

/** Quante spunte e quanti testi in una sezione (per il riassunto accanto al titolo). */
export function riassuntoSezione(s: SezioneVerbale, campi: Record<string, string | string[]>) {
  let n = 0;
  for (const c of s.campi) { const x = campi[c.k]; if (Array.isArray(x)) n += x.length; else if (x) n += 1; }
  return n;
}

/** Righe di partenza della tabella «Riepilogo prodotti da installare»: i prodotti venduti (e il materiale già aggiunto). */
export function righeIniziali(materiale: { descrizione: string; quantita: number }[]): RigaProdotto[] {
  return materiale.slice(0, MAX_RIGHE_PRODOTTI).map((m) => ({ tipo: m.descrizione, larg: "", alt: "", q: String(m.quantita), note: "" }));
}

/** Verbale da mostrare nel modulo: quello salvato, altrimenti la tabella già con i prodotti venduti. */
export function verbaleDiPartenza(salvato: unknown, materiale: { descrizione: string; quantita: number }[]): Verbale {
  const v = salvato && typeof salvato === "object" ? (salvato as Verbale) : null;
  if (v && verbaleCompilato(v)) return { campi: v.campi ?? {}, righe: Array.isArray(v.righe) ? v.righe : [], rif_interno: v.rif_interno };
  return { campi: {}, righe: righeIniziali(materiale) };
}
