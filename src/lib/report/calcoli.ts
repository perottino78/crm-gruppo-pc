// Calcoli dei report (vendite, margini, crediti, cassa, banche, simulazioni). Funzioni pure, senza database:
// testate in tests/report/calcoli.test.ts. I dati arrivano da src/lib/report/server.ts.

export const cent = (n: number) => Math.round(n * 100) / 100;
const GIORNO = 86400000;

export type VenditaR = {
  data: Date; imponibile: number; venditore: string | null; progetto: string | null; categoria: string | null;
  brand: string | null; clienteNome: string; origine?: string | null;
};
export type AcquistoR = { data: Date; imponibile: number; fornitoreNome: string; progetto: string | null };
export type ProgettoR = {
  numero: string; clienteNome: string; descrizione: string | null; categoria: string | null; stato: string | null;
  totaleOfferto: number; costoAttuale: number;
};
export type ScadenzaR = { tipo: "INCASSO" | "PAGAMENTO"; residuo: number; dataScadenza: Date | null; controparte: string };

export type Voce = { chiave: string; valore: number; n: number; quota: number };

/** Somma per chiave, dalla più grande alla più piccola, con la quota sul totale. */
export function somma<T>(righe: T[], chiave: (r: T) => string, valore: (r: T) => number): Voce[] {
  const m = new Map<string, { valore: number; n: number }>();
  for (const r of righe) {
    const k = chiave(r);
    const x = m.get(k) ?? { valore: 0, n: 0 };
    x.valore += valore(r); x.n++;
    m.set(k, x);
  }
  const tot = [...m.values()].reduce((t, x) => t + x.valore, 0);
  return [...m.entries()]
    .map(([k, x]) => ({ chiave: k, valore: cent(x.valore), n: x.n, quota: tot ? x.valore / tot : 0 }))
    .sort((a, b) => b.valore - a.valore);
}

/** Le prime n voci e il resto sommato in "Altri" (mai un colore in più: si raggruppa). */
export function primeEAltri(voci: Voce[], n: number, etichetta = "Altri"): Voce[] {
  if (voci.length <= n + 1) return voci;
  const resto = voci.slice(n);
  return [...voci.slice(0, n), { chiave: etichetta, valore: cent(resto.reduce((t, v) => t + v.valore, 0)), n: resto.reduce((t, v) => t + v.n, 0), quota: resto.reduce((t, v) => t + v.quota, 0) }];
}

// ============ margini delle commesse ============

export type Margine = {
  numero: string; clienteNome: string; descrizione: string | null; categoria: string; venditore: string | null;
  ricavo: number; costo: number; margine: number; perc: number | null; valore: number; chiusa: boolean;
  /** true se i numeri bastano per giudicarla: fatturata almeno al 70% del valore, con i costi (se aperta, almeno il 25% del ricavo). */
  valutabile: boolean;
};

/** Chi ha venduto di più (per importo) tra le fatture di una commessa. */
function prevalente(righe: { chiave: string | null; valore: number }[]): string | null {
  const m = new Map<string, number>();
  for (const r of righe) if (r.chiave) m.set(r.chiave, (m.get(r.chiave) ?? 0) + r.valore);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Margine di ogni commessa (progetto BConsole) che ha fatture di vendita: ricavo = imponibile fatturato,
 * costo = costi che BConsole ha imputato alla commessa (o, se mancano, le fatture d'acquisto collegate).
 */
export function marginiCommesse(vendite: VenditaR[], acquisti: AcquistoR[], progetti: ProgettoR[]): Margine[] {
  const perProgetto = new Map<string, VenditaR[]>();
  for (const v of vendite) if (v.progetto) perProgetto.set(v.progetto, [...(perProgetto.get(v.progetto) ?? []), v]);
  const costiCollegati = new Map<string, number>();
  for (const a of acquisti) if (a.progetto) costiCollegati.set(a.progetto, (costiCollegati.get(a.progetto) ?? 0) + a.imponibile);
  const info = new Map(progetti.map((p) => [p.numero, p]));
  const out: Margine[] = [];
  for (const [numero, fv] of perProgetto) {
    const p = info.get(numero);
    const ricavo = cent(fv.reduce((t, v) => t + v.imponibile, 0));
    if (ricavo <= 0) continue;
    const costo = cent(p && p.costoAttuale > 0 ? p.costoAttuale : costiCollegati.get(numero) ?? 0);
    const valore = cent(Math.max(p?.totaleOfferto ?? 0, ricavo));
    const chiusa = /chius/i.test(p?.stato ?? "");
    // fatturata quasi tutta (le fatture degli anni prima non sono qui) e, se è ancora aperta, con i costi già arrivati
    const valutabile = costo > 0 && ricavo >= valore * 0.7 && (chiusa || costo >= ricavo * 0.25);
    const margine = cent(ricavo - costo);
    out.push({
      numero, clienteNome: p?.clienteNome ?? fv[0].clienteNome, descrizione: p?.descrizione ?? null,
      categoria: p?.categoria ?? prevalente(fv.map((v) => ({ chiave: v.categoria, valore: v.imponibile }))) ?? "Altro",
      venditore: prevalente(fv.map((v) => ({ chiave: v.venditore, valore: v.imponibile }))),
      ricavo, costo, margine, perc: ricavo ? margine / ricavo : null, valore, chiusa, valutabile,
    });
  }
  return out.sort((a, b) => b.margine - a.margine);
}

export type MargineGruppo = { chiave: string; ricavo: number; costo: number; margine: number; perc: number | null; n: number };

/** Margine sommato per gruppo (venditore, linea di prodotto…), solo sulle commesse valutabili. */
export function marginePer(margini: Margine[], chiave: (m: Margine) => string): MargineGruppo[] {
  const m = new Map<string, MargineGruppo>();
  for (const x of margini.filter((y) => y.valutabile)) {
    const k = chiave(x);
    const g = m.get(k) ?? { chiave: k, ricavo: 0, costo: 0, margine: 0, perc: null, n: 0 };
    g.ricavo += x.ricavo; g.costo += x.costo; g.margine += x.margine; g.n++;
    m.set(k, g);
  }
  return [...m.values()]
    .map((g) => ({ ...g, ricavo: cent(g.ricavo), costo: cent(g.costo), margine: cent(g.margine), perc: g.ricavo ? g.margine / g.ricavo : null }))
    .sort((a, b) => b.margine - a.margine);
}

// ============ mesi ============

export type Mese = { chiave: string; etichetta: string; vendite: number; acquisti: number };

const meseRoma = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);

/** Vendite e acquisti (imponibile) mese per mese, dal mese di `da` a quello di `a` (esclusa). */
export function perMese(vendite: { data: Date; imponibile: number }[], acquisti: { data: Date; imponibile: number }[], da: Date, a: Date): Mese[] {
  const out: Mese[] = [];
  const nomi = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  // i limiti del periodo sono mezzanotti UTC (periodoDa); le date delle fatture si leggono all'ora di Roma
  const [aa, mm] = da.toISOString().slice(0, 7).split("-").map(Number);
  const fine = new Date(a.getTime() - 1).toISOString().slice(0, 7);
  for (let i = 0; i < 60; i++) {
    const y = aa + Math.floor((mm - 1 + i) / 12), m = ((mm - 1 + i) % 12) + 1;
    const k = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ chiave: k, etichetta: `${nomi[m - 1]} ${String(y).slice(2)}`, vendite: 0, acquisti: 0 });
    if (k >= fine) break;
  }
  const idx = new Map(out.map((x, i) => [x.chiave, i]));
  for (const v of vendite) { const i = idx.get(meseRoma(v.data)); if (i !== undefined) out[i].vendite += v.imponibile; }
  for (const v of acquisti) { const i = idx.get(meseRoma(v.data)); if (i !== undefined) out[i].acquisti += v.imponibile; }
  return out.map((x) => ({ ...x, vendite: cent(x.vendite), acquisti: cent(x.acquisti) }));
}

// ============ crediti, debiti, cassa ============

export const FASCE = ["Non scaduto", "Scaduto da 1-30 giorni", "31-60 giorni", "61-90 giorni", "Oltre 90 giorni"] as const;

/** Anzianità dei residui aperti (crediti verso clienti o debiti verso fornitori). */
export function anzianita(scadenze: ScadenzaR[], oggi: Date): { fascia: string; importo: number; n: number }[] {
  const out = FASCE.map((f) => ({ fascia: f as string, importo: 0, n: 0 }));
  for (const s of scadenze) {
    if (s.residuo <= 0.004) continue;
    const ritardo = s.dataScadenza ? Math.floor((oggi.getTime() - s.dataScadenza.getTime()) / GIORNO) : 0;
    const i = ritardo <= 0 ? 0 : ritardo <= 30 ? 1 : ritardo <= 60 ? 2 : ritardo <= 90 ? 3 : 4;
    out[i].importo += s.residuo; out[i].n++;
  }
  return out.map((x) => ({ ...x, importo: cent(x.importo) }));
}

/** Giorni medi di incasso (DSO): crediti aperti / fatturato (IVA compresa) del periodo × giorni del periodo. */
export function giorniIncasso(creditiAperti: number, fatturatoIvato: number, giorniPeriodo: number): number | null {
  if (fatturatoIvato <= 0 || giorniPeriodo <= 0) return null;
  return Math.round((creditiAperti / fatturatoIvato) * giorniPeriodo);
}

export type SettimanaCassa = { inizio: Date; incassi: number; pagamenti: number; saldo: number };

/**
 * Cassa prevista settimana per settimana: saldo di oggi + incassi attesi − pagamenti in scadenza.
 * Gli incassi già scaduti entrano solo per la parte `recuperoScaduti` (0-1) nella prima settimana;
 * i pagamenti scaduti si considerano da pagare subito, per la parte `pagamentiScaduti` (0-1, di base tutti).
 */
export function previsioneCassa(saldoOggi: number, scadenze: ScadenzaR[], oggi: Date, settimane = 13, opz: { recuperoScaduti?: number; ritardoIncassiGiorni?: number; pagamentiScaduti?: number } = {}): SettimanaCassa[] {
  const inizio = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate()));
  const out: SettimanaCassa[] = Array.from({ length: settimane }, (_, i) => ({ inizio: new Date(inizio.getTime() + i * 7 * GIORNO), incassi: 0, pagamenti: 0, saldo: 0 }));
  const rec = opz.recuperoScaduti ?? 0, ritardo = opz.ritardoIncassiGiorni ?? 0;
  for (const s of scadenze) {
    if (s.residuo <= 0.004) continue;
    let quando = s.dataScadenza ?? inizio;
    let importo = s.residuo;
    if (s.tipo === "INCASSO") {
      if (quando < inizio) importo *= rec; // già scaduto: entra solo la parte che si pensa di recuperare
      quando = new Date(Math.max(quando.getTime(), inizio.getTime()) + ritardo * GIORNO);
    } else if (quando < inizio) importo *= opz.pagamentiScaduti ?? 1;
    const i = Math.max(0, Math.floor((quando.getTime() - inizio.getTime()) / (7 * GIORNO)));
    if (i >= settimane || importo <= 0) continue;
    if (s.tipo === "INCASSO") out[i].incassi += importo; else out[i].pagamenti += importo;
  }
  let saldo = saldoOggi;
  return out.map((w) => { saldo += w.incassi - w.pagamenti; return { ...w, incassi: cent(w.incassi), pagamenti: cent(w.pagamenti), saldo: cent(saldo) }; });
}

// ============ banche ============

const BANCHE: [string, RegExp][] = [
  ["BPER", /bper/i], ["Intesa Sanpaolo", /intesa/i], ["Crédit Agricole", /agricole|cariparma/i], ["Deutsche Bank", /deutsche/i],
  ["Findomestic", /findomestic/i], ["BNL", /\bbnl\b|nazionale del lavoro/i], ["UniCredit", /unicredit/i], ["Banco BPM", /banco bpm|\bbpm\b/i],
  ["Nexi", /nexi/i], ["SumUp", /sumup/i], ["PayPal", /paypal/i], ["Poste", /poste italiane|bancoposta/i], ["Compass", /compass/i], ["Agos", /agos/i],
];

/** Nome della banca dal fornitore o dal conto; null se non è una banca (i fondi pensione/TFR delle banche non contano). */
export function bancaDi(nome: string | null | undefined): string | null {
  const t = nome ?? "";
  if (/vita|tfr|previdenz|assicuraz/i.test(t)) return null;
  for (const [b, re] of BANCHE) if (re.test(t)) return b;
  return /\bbanca\b|\bbank\b|banco/i.test(t) ? t.trim() : null;
}

// ============ simulazione ============

export type Base = { ricavi: number; costi: number; crediti: number; fatturatoIvato: number; giorniPeriodo: number };
export type Scenario = { prezzi: number; costi: number; volumi: number; giorniIncassoMeno: number };

/**
 * Cosa succede se: prezzi +x%, costi −y%, volumi +z%, incassi più veloci di N giorni.
 * Margine = ricavi − costi; la cassa liberata dagli incassi più veloci = fatturato giornaliero × giorni guadagnati.
 */
export function simula(b: Base, s: Scenario) {
  const ricavi = b.ricavi * (1 + s.prezzi / 100) * (1 + s.volumi / 100);
  const costi = b.costi * (1 - s.costi / 100) * (1 + s.volumi / 100);
  const margine = ricavi - costi;
  const marginePrima = b.ricavi - b.costi;
  const dso = giorniIncasso(b.crediti, b.fatturatoIvato, b.giorniPeriodo);
  const giornaliero = b.giorniPeriodo ? b.fatturatoIvato / b.giorniPeriodo : 0;
  const giorniGuadagnati = Math.min(s.giorniIncassoMeno, dso ?? 0);
  return {
    ricavi: cent(ricavi), costi: cent(costi), margine: cent(margine), perc: ricavi ? margine / ricavi : null,
    differenzaMargine: cent(margine - marginePrima), percPrima: b.ricavi ? marginePrima / b.ricavi : null,
    dsoPrima: dso, dsoDopo: dso === null ? null : Math.max(0, dso - giorniGuadagnati), cassaLiberata: cent(giornaliero * giorniGuadagnati),
  };
}
