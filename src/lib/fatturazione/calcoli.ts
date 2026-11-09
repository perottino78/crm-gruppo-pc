// Fatturazione: calcoli puri (righe, riepilogo IVA, bollo, scadenze, numerazione). Testati in tests/fatturazione/calcoli.test.ts.
import { IMPORTO_BOLLO, NATURE_CON_BOLLO, SOGLIA_BOLLO, metodoPagamento, sezionale, codiceIvaDa } from "./tabelle";

export const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type RigaCalcolo = { quantita: number; prezzo: number; sconto?: number | null; aliquota: number; natura?: string | null };

/** Importo imponibile della riga: quantità × prezzo − sconto %, al centesimo. */
export const importoRiga = (r: RigaCalcolo) => cent(r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100));

export type VoceRiepilogo = { aliquota: number; natura: string | null; imponibile: number; imposta: number; norma: string | null };

/** Riepilogo per aliquota/natura come nella fattura elettronica: l'imposta si calcola sul totale dell'aliquota. */
export function riepilogoIva(righe: RigaCalcolo[]): VoceRiepilogo[] {
  const gruppi = new Map<string, VoceRiepilogo>();
  for (const r of righe) {
    const k = `${r.aliquota}|${r.natura ?? ""}`;
    const g = gruppi.get(k) ?? { aliquota: r.aliquota, natura: r.natura ?? null, imponibile: 0, imposta: 0, norma: r.natura ? codiceIvaDa(0, r.natura).norma ?? null : null };
    g.imponibile = cent(g.imponibile + importoRiga(r));
    gruppi.set(k, g);
  }
  return [...gruppi.values()].map((g) => ({ ...g, imposta: g.natura ? 0 : cent((g.imponibile * g.aliquota) / 100) })).sort((a, b) => b.aliquota - a.aliquota);
}

/** Serve la marca da bollo da 2 €? Sì se le operazioni senza IVA soggette a bollo superano 77,47 €. */
export function serveBollo(righe: RigaCalcolo[]): boolean {
  const senzaIva = righe.filter((r) => r.natura && NATURE_CON_BOLLO.includes(r.natura)).reduce((t, r) => t + importoRiga(r), 0);
  return senzaIva > SOGLIA_BOLLO;
}

export type Totali = { imponibile: number; iva: number; bollo: number; totale: number; riepilogo: VoceRiepilogo[] };

/** Totali del documento. Il bollo si somma al totale solo se addebitato al cliente. */
export function totali(righe: RigaCalcolo[], opz: { bollo?: boolean; addebitoBollo?: boolean } = {}): Totali {
  const riepilogo = riepilogoIva(righe);
  const imponibile = cent(riepilogo.reduce((t, v) => t + v.imponibile, 0));
  const iva = cent(riepilogo.reduce((t, v) => t + v.imposta, 0));
  const bollo = opz.bollo ? IMPORTO_BOLLO : 0;
  return { imponibile, iva, bollo, totale: cent(imponibile + iva + (opz.addebitoBollo ? bollo : 0)), riepilogo };
}

/** Ultimo giorno del mese di una data (UTC, mezzogiorno). */
const fineMese = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));

/** Rate di incasso dal metodo di pagamento: giorni dalla data fattura (a fine mese se F.M.), importi divisi in parti uguali. */
export function rateDaMetodo(metodo: string | null | undefined, dataFattura: Date, totale: number): { data: Date; importo: number }[] {
  const m = metodoPagamento(metodo);
  const n = m.rate.length;
  const quota = cent(totale / n);
  return m.rate.map((gg, i) => {
    const base = new Date(Date.UTC(dataFattura.getUTCFullYear(), dataFattura.getUTCMonth(), dataFattura.getUTCDate() + gg, 12));
    const data = m.fineMese && gg > 0 ? fineMese(base) : base;
    const importo = i === n - 1 ? cent(totale - quota * (n - 1)) : quota;
    return { data, importo };
  });
}

/** Numero completo della fattura come in BConsole: «518/FE/2026». */
export const numeroFattura = (numero: number, codiceSezionale: string, anno: number) => `${numero}/${sezionale(codiceSezionale).estensione}/${anno}`;
/** Numero di prova (fatture non valide, emesse mentre si collauda): «PROVA 3/FE/2026». */
export const numeroProva = (numero: number, codiceSezionale: string, anno: number) => `PROVA ${numeroFattura(numero, codiceSezionale, anno)}`;

/** Dal numero di una fattura (es. importata da BConsole «518/FE/2026») il progressivo, se è dello stesso sezionale e anno. */
export function progressivoDa(numero: string, codiceSezionale: string, anno: number): number | null {
  const est = sezionale(codiceSezionale).estensione.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^\\s*(\\d+)\\s*/\\s*${est}\\s*/\\s*${anno}\\s*$`, "i").exec(numero);
  return m ? Number(m[1]) : null;
}

/** Prossimo numero: dopo il più alto fra quelli già usati (CRM, fatture importate da BConsole) e l'ultimo indicato a mano. */
export function prossimoNumero(usati: number[], ultimoIndicato?: number | null): number {
  return Math.max(0, ultimoIndicato ?? 0, ...usati) + 1;
}

/** Numero del DDT come in BConsole: «551/2026». */
export const numeroDdt = (d: { numero: number | null; anno: number; prova?: boolean }) => (d.numero ? `${d.prova ? "PROVA " : ""}${d.numero}/${d.anno}` : "bozza");

/** Stato del DDT dalle righe fatturate. */
export function statoDdtDaRighe(statoAttuale: string, righe: { fatturata: boolean }[]): string {
  if (statoAttuale === "BOZZA" || statoAttuale === "CHIUSO") return statoAttuale;
  if (!righe.length) return statoAttuale;
  const f = righe.filter((r) => r.fatturata).length;
  return f === 0 ? "DA_FATTURARE" : f === righe.length ? "FATTURATO" : "PARZ_FATTURATO";
}

/**
 * Proposta di fattura dalla commessa (come «Fattura di acconto» e «Fattura a saldo» di BConsole):
 * acconto = importo dell'acconto previsto; saldo = imponibile della commessa meno gli acconti già fatturati.
 * Gli importi della commessa sono IVA compresa: l'imponibile si ricava con l'aliquota indicata.
 */
export function propostaDaCommessa(tipo: "ACCONTO" | "SALDO", c: { totaleVendita: number; totaleImponibile: number; accontoImporto: number }, accontiFatturatiImponibile: number, aliquota: number) {
  const scorporo = (lordo: number) => cent(lordo / (1 + aliquota / 100));
  if (tipo === "ACCONTO") {
    const lordo = c.accontoImporto > 0 ? c.accontoImporto : cent(c.totaleVendita / 2);
    return { descrizione: "Acconto", imponibile: scorporo(lordo) };
  }
  const imponibile = c.totaleImponibile > 0 ? c.totaleImponibile : scorporo(c.totaleVendita);
  return { descrizione: "Saldo", imponibile: cent(imponibile - accontiFatturatiImponibile) };
}
