// Magazzino: costanti e calcoli puri (bolle d'entrata, spunta, giacenze, abbinamenti).
// Nessun accesso al database: tutto è testato in tests/magazzino/magazzino.test.ts.

export const STATI_BOLLA: Record<string, { nome: string; colore: string }> = {
  APERTA: { nome: "In spunta", colore: "#d97706" },
  DA_FATTURARE: { nome: "Da fatturare", colore: "#ca8a04" },
  FATTURATA: { nome: "Fatturata", colore: "#15803d" },
  CHIUSA: { nome: "Chiusa (senza fattura)", colore: "#0f766e" },
  ANNULLATA: { nome: "Annullata", colore: "#6b7280" },
};
export const statoBolla = (k: string) => STATI_BOLLA[k] ?? { nome: k, colore: "#6b7280" };

export const CAUSALI_BOLLA: Record<string, string> = {
  ACQUISTO: "Acquisto merce",
  OMAGGIO: "Omaggio da fornitore",
  RIENTRO_RIPARAZIONE: "Rientro da riparazione",
  CONTO_VISIONE: "Conto visione",
  RESO_CANTIERE: "Reso da cantiere",
  ALTRO: "Altro",
};

export const ESITI_RIGA: Record<string, { nome: string; cls: string }> = {
  DA_CONTROLLARE: { nome: "Da controllare", cls: "bg-neutral-100 text-neutral-700" },
  OK: { nome: "OK", cls: "bg-green-100 text-green-900" },
  PARZIALE: { nome: "Parziale", cls: "bg-amber-100 text-amber-900" },
  MANCANTE: { nome: "Mancante", cls: "bg-red-100 text-red-900" },
  DANNEGGIATO: { nome: "Danneggiato", cls: "bg-red-100 text-red-900" },
};

export const CAUSALI_MOVIMENTO: Record<string, string> = {
  ACQUISTO: "Carico da acquisto",
  OMAGGIO: "Carico omaggio",
  RESO_CANTIERE: "Rientro da cantiere",
  PRELIEVO_COMMESSA: "Prelievo per commessa",
  RESO_FORNITORE: "Reso al fornitore",
  RETTIFICA: "Rettifica",
  INVENTARIO: "Inventario",
  STORNO: "Storno bolla",
};

const cent = (n: number) => Math.round(n * 100) / 100;
const q3 = (n: number) => Math.round(n * 1000) / 1000 || 0;

/** Causali che non prevedono una fattura del fornitore: la bolla registrata si chiude subito. */
export const CAUSALI_SENZA_FATTURA = ["OMAGGIO", "RIENTRO_RIPARAZIONE", "CONTO_VISIONE", "RESO_CANTIERE"];

export const numeroBolla = (b: { numero: number; anno: number }) => `${b.numero}/${b.anno}`;

/** Numero italiano tollerante: "1.234,5" · "1234.5" · "12" → numero; vuoto/non valido → null. */
export function leggiQuantita(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Quantità che la riga di bolla mette effettivamente a disposizione.
 * MANCANTE e DANNEGGIATO non contano; OK senza quantità spuntata = quantità della bolla;
 * PARZIALE usa la quantità ricevuta. DA_CONTROLLARE non conta (la riga va spuntata).
 */
export function quantitaUtile(r: { esito: string; quantitaBolla: number; quantitaRicevuta: number | null }): number {
  if (r.esito === "OK") return Math.max(0, r.quantitaRicevuta ?? r.quantitaBolla);
  if (r.esito === "PARZIALE") return Math.max(0, r.quantitaRicevuta ?? 0);
  return 0;
}

/** Righe che bloccano la registrazione della bolla (ancora da controllare). */
export const righeDaControllare = (righe: { esito: string }[]) => righe.filter((r) => r.esito === "DA_CONTROLLARE").length;

export type RigaBollaCalcolo = {
  id: string; esito: string; quantitaBolla: number; quantitaRicevuta: number | null; destinazione: string;
  rigaOrdineId: string | null; articoloId: string | null; prezzo: number | null;
};
export type RigaOrdineCalcolo = { id: string; quantita: number; quantitaArrivata: number; arrivato: boolean; ordineFornitoreId: string | null; commessaId: string | null; prezzoAcquisto: number | null; scontoAcquisto: number | null };

export type PianoBolla = {
  righeOrdine: { id: string; quantitaArrivata: number; arrivato: boolean; ordineFornitoreId: string | null; commessaId: string | null }[];
  carichi: { rigaBollaId: string; articoloId: string; quantita: number; costoUnitario: number | null; rigaOrdineId: string | null }[];
  avvisi: string[];
};

/**
 * Cosa succede registrando una bolla: quantità arrivate sulle righe d'ordine (anche arrivi parziali
 * su più bolle) e carichi a magazzino per le righe destinate a scorta. Se segno = -1 calcola lo storno.
 */
export function pianoBolla(righeBolla: RigaBollaCalcolo[], righeOrdine: RigaOrdineCalcolo[], segno: 1 | -1 = 1): PianoBolla {
  const perId = new Map(righeOrdine.map((r) => [r.id, { ...r }]));
  const toccate = new Set<string>();
  const carichi: PianoBolla["carichi"] = [];
  const avvisi: string[] = [];
  for (const rb of righeBolla) {
    const q = quantitaUtile(rb);
    if (rb.rigaOrdineId) {
      const ro = perId.get(rb.rigaOrdineId);
      if (ro) {
        ro.quantitaArrivata = q3(Math.max(0, ro.quantitaArrivata + segno * q));
        ro.arrivato = ro.quantitaArrivata + 1e-9 >= ro.quantita;
        toccate.add(ro.id);
        if (segno === 1 && ro.quantitaArrivata > ro.quantita + 1e-9) avvisi.push(`Arrivata più merce del previsto su una riga d'ordine (${ro.quantitaArrivata} su ${ro.quantita}).`);
      }
    }
    if (rb.destinazione === "MAGAZZINO" && rb.articoloId && q > 0) {
      const ro = rb.rigaOrdineId ? perId.get(rb.rigaOrdineId) : undefined;
      const costo = rb.prezzo ?? (ro?.prezzoAcquisto != null ? cent(ro.prezzoAcquisto * (1 - (ro.scontoAcquisto ?? 0) / 100)) : null);
      carichi.push({ rigaBollaId: rb.id, articoloId: rb.articoloId, quantita: segno * q, costoUnitario: costo, rigaOrdineId: rb.rigaOrdineId });
    }
    if (segno === 1 && rb.destinazione === "MAGAZZINO" && !rb.articoloId && q > 0) avvisi.push("Una riga destinata a magazzino non è collegata a un articolo: non entra nelle giacenze.");
  }
  return {
    righeOrdine: [...toccate].map((id) => { const r = perId.get(id)!; return { id, quantitaArrivata: r.quantitaArrivata, arrivato: r.arrivato, ordineFornitoreId: r.ordineFornitoreId, commessaId: r.commessaId }; }),
    carichi,
    avvisi: [...new Set(avvisi)],
  };
}

/** Commessa con tutto il materiale disponibile: ci sono righe e sono tutte arrivate (o prelevate da magazzino). */
export function materialeCompleto(righe: { arrivato: boolean }[]): boolean {
  return righe.length > 0 && righe.every((r) => r.arrivato);
}

/** Riepilogo materiale di una commessa per la spunta. */
export function riepilogoMateriale(righe: { arrivato: boolean; ordinato: boolean; ordineFornitoreId: string | null; daMagazzino: boolean; quantita: number; quantitaArrivata: number }[]) {
  const tot = righe.length;
  const arrivate = righe.filter((r) => r.arrivato).length;
  const parziali = righe.filter((r) => !r.arrivato && r.quantitaArrivata > 0).length;
  const daOrdinare = righe.filter((r) => !r.arrivato && !r.daMagazzino && !r.ordineFornitoreId && !r.ordinato).length;
  const inArrivo = righe.filter((r) => !r.arrivato && (r.ordineFornitoreId || r.ordinato) && !r.daMagazzino).length;
  const daPrelevare = righe.filter((r) => !r.arrivato && r.daMagazzino).length;
  return { tot, arrivate, parziali, daOrdinare, inArrivo, daPrelevare, completo: materialeCompleto(righe), percentuale: tot ? Math.round((arrivate / tot) * 100) : 0 };
}

export type Movimento = { quantita: number; costoUnitario: number | null; tipo: string };

/** Giacenza e costo medio ponderato dai movimenti (il costo medio considera solo i carichi con prezzo). */
export function riepilogoMovimenti(movimenti: Movimento[], costoAnagrafica: number | null = null) {
  let giacenza = 0, qCosto = 0, valCosto = 0;
  for (const m of movimenti) {
    giacenza += m.quantita;
    if (m.quantita > 0 && m.costoUnitario !== null && m.tipo === "CARICO") { qCosto += m.quantita; valCosto += m.quantita * m.costoUnitario; }
  }
  giacenza = q3(giacenza);
  const costoMedio = qCosto > 0 ? cent(valCosto / qCosto) : costoAnagrafica;
  return { giacenza, costoMedio, valore: costoMedio !== null ? cent(Math.max(0, giacenza) * costoMedio) : null };
}

/** Disponibilità: giacenza meno impegnato (righe di commesse aperte da prelevare dal magazzino). */
export function disponibilita(giacenza: number, impegnato: number, scortaMinima: number | null) {
  const disponibile = q3(giacenza - impegnato);
  const sottoScorta = scortaMinima !== null && scortaMinima > 0 ? disponibile < scortaMinima : disponibile < 0;
  const daRiordinare = scortaMinima !== null && scortaMinima > 0 ? Math.max(0, q3(scortaMinima * 2 - disponibile)) : Math.max(0, -disponibile);
  return { disponibile, sottoScorta, daRiordinare };
}

/** Differenza da registrare per allineare la giacenza a quella contata (inventario). */
export const differenzaInventario = (giacenza: number, contata: number) => q3(contata - giacenza);

// ---------- abbinamento righe lette (bolla o fattura) con le righe ordinate ----------

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const codiceNorm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const parole = (s: string) => new Set(norm(s).split(" ").filter((p) => p.length > 2));

/** Somiglianza fra due descrizioni (0–1): parole in comune sul totale della più corta. */
export function somiglianza(a: string, b: string): number {
  const pa = parole(a), pb = parole(b);
  if (!pa.size || !pb.size) return 0;
  let comuni = 0;
  for (const p of pa) if (pb.has(p)) comuni++;
  return comuni / Math.min(pa.size, pb.size);
}

export type Candidata = { id: string; codice: string | null; codiceFornitore: string | null; descrizione: string; residuo: number };
export type DaAbbinare = { codice?: string | null; descrizione: string; quantita?: number | null };

/**
 * Abbina ogni riga letta alla riga d'ordine più probabile: prima per codice fornitore/codice identico,
 * poi per descrizione (somiglianza ≥ 0,6). Ogni riga d'ordine si usa una volta sola.
 */
export function abbinaRighe(lette: DaAbbinare[], candidate: Candidata[]): (string | null)[] {
  const usate = new Set<string>();
  const esito: (string | null)[] = lette.map(() => null);
  lette.forEach((l, i) => {
    const c = codiceNorm(l.codice);
    if (!c) return;
    const trovata = candidate.find((x) => !usate.has(x.id) && (codiceNorm(x.codiceFornitore) === c || codiceNorm(x.codice) === c));
    if (trovata) { esito[i] = trovata.id; usate.add(trovata.id); }
  });
  lette.forEach((l, i) => {
    if (esito[i]) return;
    let migliore: { id: string; s: number } | null = null;
    for (const x of candidate) {
      if (usate.has(x.id)) continue;
      const s = somiglianza(l.descrizione, x.descrizione);
      if (s >= 0.6 && (!migliore || s > migliore.s)) migliore = { id: x.id, s };
    }
    if (migliore) { esito[i] = migliore.id; usate.add(migliore.id); }
  });
  return esito;
}

/** Ritardo di una consegna attesa in giorni (positivo = in ritardo). */
export function giorniRitardo(prevista: Date | null | undefined, oggi = new Date()): number | null {
  if (!prevista) return null;
  const g = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((g(oggi) - g(prevista)) / 86400000);
}
