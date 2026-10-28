// Anagrafica articoli: calcolo di costo d'acquisto e prezzo di vendita.
// Funzioni pure (niente database), testate in tests/articoli/articoli.test.ts.
//
// Costo:   listino fornitore x (1 - s1) x (1 - s2) ...   (sconti a cascata, es. "50+10")
// Vendita: RICARICO -> costo x coefficiente (es. 3,3)
//          MARGINE  -> costo / (1 - margine%)  (es. margine 40% -> costo / 0,6)
//          MANUALE  -> prezzo scritto a mano, non si ricalcola
// La regola si cerca prima sull'articolo, poi sulla sottocategoria, poi sulla categoria madre.

export type MetodoPrezzo = "RICARICO" | "MARGINE" | "MANUALE";
export const METODI: { v: MetodoPrezzo; label: string }[] = [
  { v: "RICARICO", label: "Ricarico sul costo (×)" },
  { v: "MARGINE", label: "Margine sul prezzo (%)" },
  { v: "MANUALE", label: "Prezzo a mano" },
];

export const UNITA = ["pz", "m", "m²", "m³", "kg", "l", "ml", "conf", "kit", "set", "h", "cad"];
export const ALIQUOTE = [22, 10, 4, 0];

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Numero scritto all'italiana o all'inglese: "1.234,50", "1234.5", "€ 12,30", "40%". null se vuoto o non valido. */
export function leggiNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  let s = String(v).trim().replace(/€|eur|%|\s/gi, "");
  if (!s || s === "-") return null;
  const neg = /^\(.*\)$/.test(s);
  if (neg) s = s.slice(1, -1);
  const v1 = s.lastIndexOf(","), p1 = s.lastIndexOf(".");
  if (v1 >= 0 && p1 >= 0) s = v1 > p1 ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (v1 >= 0) s = (s.match(/,/g)!.length > 1 ? s.replace(/,/g, "") : s.replace(",", "."));
  else if (p1 >= 0 && (s.match(/\./g)!.length > 1 || /^\d{1,3}\.\d{3}$/.test(s))) s = s.replace(/\./g, "");
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** "50+10+5" → [50,10,5]. Accetta anche "50%+10%", "50 + 10", "50/10", "50;10". null se non leggibile. */
export function leggiSconti(s: string | null | undefined): number[] | null {
  if (s === null || s === undefined) return [];
  const t = String(s).trim();
  if (!t) return [];
  const parti = t.split(/[+/;]|\s+\+?\s*/).map((x) => x.trim()).filter(Boolean);
  const out: number[] = [];
  for (const p of parti) {
    const n = leggiNumero(p);
    if (n === null || n < 0 || n >= 100) return null;
    out.push(n);
  }
  return out;
}

/** Fattore che resta dopo gli sconti a cascata: "50+10" → 0,45. */
export function fattoreSconti(s: string | null | undefined): number {
  const l = leggiSconti(s) ?? [];
  return r4(l.reduce((f, x) => f * (1 - x / 100), 1));
}

/** Sconto unico equivalente in %: "50+10" → 55. */
export const scontoEquivalente = (s: string | null | undefined) => r2((1 - fattoreSconti(s)) * 100);

/** Scrittura normalizzata degli sconti: [50,10] → "50+10". */
export const scriviSconti = (l: number[]) => l.map((x) => String(x).replace(".", ",")).join("+");

/** Costo netto d'acquisto: dal listino con gli sconti, oppure il costo scritto a mano. */
export function costoNetto(a: { prezzoListino?: number | null; sconti?: string | null; costoAcquisto?: number | null }): number | null {
  if (a.prezzoListino !== null && a.prezzoListino !== undefined) return r2(a.prezzoListino * fattoreSconti(a.sconti));
  return a.costoAcquisto ?? null;
}

export type Regola = { metodo: MetodoPrezzo; valore: number | null; arrotondamento: number | null; margineMinimo: number | null; da: string };
export type CategoriaRegola = { id: string; nome: string; padreId: string | null; metodoPrezzo: string | null; valore: number | null; arrotondamento: number | null; margineMinimo: number | null };

/** Regola valida per l'articolo: la sua, altrimenti quella della sottocategoria, altrimenti della categoria madre. */
export function regolaEffettiva(
  a: { metodoPrezzo?: string | null; valorePrezzo?: number | null; categoriaId?: string | null },
  categorie: CategoriaRegola[],
): Regola | null {
  const catena: CategoriaRegola[] = [];
  let c = categorie.find((x) => x.id === a.categoriaId);
  for (let i = 0; c && i < 10; i++) { catena.push(c); c = c.padreId ? categorie.find((x) => x.id === c!.padreId) : undefined; }
  const arrot = catena.find((x) => x.arrotondamento)?.arrotondamento ?? null;
  const minimo = catena.find((x) => x.margineMinimo !== null && x.margineMinimo !== undefined)?.margineMinimo ?? null;
  if (a.metodoPrezzo === "MANUALE") return { metodo: "MANUALE", valore: null, arrotondamento: null, margineMinimo: minimo, da: "articolo" };
  if ((a.metodoPrezzo === "RICARICO" || a.metodoPrezzo === "MARGINE") && a.valorePrezzo !== null && a.valorePrezzo !== undefined)
    return { metodo: a.metodoPrezzo, valore: a.valorePrezzo, arrotondamento: arrot, margineMinimo: minimo, da: "articolo" };
  const cr = catena.find((x) => (x.metodoPrezzo === "RICARICO" || x.metodoPrezzo === "MARGINE") && x.valore !== null && x.valore !== undefined);
  if (!cr) return null;
  return { metodo: cr.metodoPrezzo as MetodoPrezzo, valore: cr.valore, arrotondamento: arrot, margineMinimo: minimo, da: cr.nome };
}

/** Arrotondamento per eccesso al passo indicato (0,5 → 12,30 diventa 12,50). */
export function arrotonda(n: number, passo: number | null | undefined): number {
  if (!passo || passo <= 0) return r2(n);
  return r2(Math.ceil(r4(n / passo) - 1e-9) * passo);
}

/** Prezzo di vendita calcolato dalla regola. null se manca il costo o la regola (o se è a mano). */
export function prezzoDaRegola(costo: number | null, regola: Regola | null): number | null {
  if (costo === null || !regola || regola.metodo === "MANUALE" || regola.valore === null) return null;
  if (regola.metodo === "RICARICO") return regola.valore > 0 ? arrotonda(costo * regola.valore, regola.arrotondamento) : null;
  if (regola.valore >= 100 || regola.valore < 0) return null;
  return arrotonda(costo / (1 - regola.valore / 100), regola.arrotondamento);
}

/** Margine % sul prezzo di vendita: (vendita − costo) / vendita. */
export const margine = (costo: number | null, vendita: number | null) =>
  costo === null || vendita === null || vendita <= 0 ? null : r2(((vendita - costo) / vendita) * 100);

/** Ricarico come coefficiente: vendita / costo (es. 3,3). */
export const coefficiente = (costo: number | null, vendita: number | null) =>
  costo === null || vendita === null || costo <= 0 ? null : r2(vendita / costo);

export type Calcolo = { costo: number | null; vendita: number | null; regola: Regola | null; margine: number | null; coefficiente: number | null; sottoMinimo: boolean; ivato: number | null };

/** Calcolo completo di un articolo: costo, prezzo (da regola o a mano), margine e avviso se sotto il minimo. */
export function calcolaArticolo(
  a: { prezzoListino?: number | null; sconti?: string | null; costoAcquisto?: number | null; metodoPrezzo?: string | null; valorePrezzo?: number | null; prezzoVendita?: number | null; categoriaId?: string | null; aliquotaIva?: number | null },
  categorie: CategoriaRegola[],
): Calcolo {
  const costo = costoNetto(a);
  const regola = regolaEffettiva(a, categorie);
  const daRegola = prezzoDaRegola(costo, regola);
  const vendita = regola?.metodo === "MANUALE" || daRegola === null ? (a.prezzoVendita ?? null) : daRegola;
  const m = margine(costo, vendita);
  return {
    costo, vendita, regola, margine: m, coefficiente: coefficiente(costo, vendita),
    sottoMinimo: m !== null && regola?.margineMinimo !== null && regola?.margineMinimo !== undefined && m < regola.margineMinimo,
    ivato: vendita === null ? null : r2(vendita * (1 + (a.aliquotaIva ?? 22) / 100)),
  };
}

/** Descrizione leggibile della regola: "×3,3" oppure "margine 40%". */
export function testoRegola(r: { metodo?: string | null; metodoPrezzo?: string | null; valore?: number | null } | null): string {
  if (!r) return "—";
  const m = r.metodo ?? r.metodoPrezzo;
  if (m === "MANUALE") return "a mano";
  if (r.valore === null || r.valore === undefined) return "—";
  const v = String(r.valore).replace(".", ",");
  return m === "RICARICO" ? `×${v}` : m === "MARGINE" ? `margine ${v}%` : "—";
}

export const euro = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, useGrouping: "always" as unknown as boolean });
export const perc = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${String(n).replace(".", ",")}%`);

/** Categorie in ordine ad albero per i menu a tendina: madri seguite dalle loro sottocategorie. */
export function alberoCategorie<T extends { id: string; nome: string; padreId: string | null; ordine?: number }>(cat: T[]): (T & { livello: number; etichetta: string })[] {
  const ord = (a: T, b: T) => (a.ordine ?? 0) - (b.ordine ?? 0) || a.nome.localeCompare(b.nome, "it");
  const out: (T & { livello: number; etichetta: string })[] = [];
  for (const m of cat.filter((c) => !c.padreId || !cat.some((x) => x.id === c.padreId)).sort(ord)) {
    out.push({ ...m, livello: 0, etichetta: m.nome });
    for (const f of cat.filter((c) => c.padreId === m.id).sort(ord)) out.push({ ...f, livello: 1, etichetta: `${m.nome} › ${f.nome}` });
  }
  return out;
}
