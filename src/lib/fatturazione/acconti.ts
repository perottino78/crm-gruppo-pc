// Acconti da dedurre nella fattura di saldo (modulo puro, senza database; test in tests/fatturazione/acconti.test.ts).

export type AccontoEmesso = {
  /** Numero della fattura di acconto (es. «541/FE/2026»). */
  numero: string;
  data: Date;
  imponibile: number;
  /** Aliquota IVA con cui l'acconto è stato fatturato. */
  aliquota: number;
  fonte: "CRM" | "BCONSOLE";
};

const ALIQUOTE = [0, 4, 5, 10, 22];

/** Numero confrontabile: senza spazi e in maiuscolo («541/fe/2026 » = «541/FE/2026»). */
export const chiaveNumero = (n: string | null | undefined) => (n ?? "").replace(/\s+/g, "").toUpperCase();

/** Aliquota ricavata da imponibile e IVA di una fattura importata; se non è una aliquota nota usa quella di ripiego. */
export function aliquotaDa(imponibile: number, iva: number, ripiego: number): number {
  const a = imponibile ? Math.round((Math.abs(iva) / Math.abs(imponibile)) * 100) : ripiego;
  return ALIQUOTE.includes(a) ? a : ripiego;
}

/** Testo della riga di deduzione (sempre lo stesso: serve anche per riconoscere le righe già presenti). */
export const PREFISSO_DEDUZIONE = "A dedurre acconto fattura n. ";
export function descrizioneDeduzione(a: Pick<AccontoEmesso, "numero" | "data">): string {
  return `${PREFISSO_DEDUZIONE}${a.numero} del ${a.data.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`;
}

/** Numeri di fattura già dedotti, letti dalle descrizioni delle righe («A dedurre acconto fattura n. X del …»). */
export function numeriGiaDedotti(descrizioni: string[]): Set<string> {
  const s = new Set<string>();
  for (const d of descrizioni) {
    const m = /acconto\s+fattura\s+n\.?\s*(\S+)/i.exec(d);
    if (m) s.add(chiaveNumero(m[1]));
  }
  return s;
}

/**
 * Unisce gli acconti emessi (CRM e BConsole) senza doppioni (stesso numero = stessa fattura: ha la precedenza quella del CRM),
 * ordinati per data, e toglie quelli già presenti come riga di deduzione.
 */
export function accontiDaDedurre(candidati: AccontoEmesso[], descrizioniRighe: string[] = []): AccontoEmesso[] {
  const visti = numeriGiaDedotti(descrizioniRighe);
  const unici = new Map<string, AccontoEmesso>();
  for (const a of [...candidati].sort((x, y) => (x.fonte === y.fonte ? 0 : x.fonte === "CRM" ? -1 : 1))) {
    const k = chiaveNumero(a.numero);
    if (!k || visti.has(k) || unici.has(k)) continue;
    unici.set(k, a);
  }
  return [...unici.values()].sort((x, y) => x.data.getTime() - y.data.getTime());
}

/** Riga di fattura (prezzo negativo) per un acconto. */
export function rigaDeduzione(a: AccontoEmesso) {
  return { descrizione: descrizioneDeduzione(a), quantita: 1, um: null as string | null, prezzo: -Math.abs(a.imponibile), aliquota: a.aliquota, natura: null as string | null };
}

/**
 * Gli acconti BConsole non agganciati a una commessa (commessaId vuoto) si attribuiscono a questa commessa solo se il cliente
 * ne ha UNA sola aperta (non annullata né chiusa) e questa è proprio quella della fattura.
 */
export function nonAgganciatiAttribuibili(commesseAperteDelCliente: string[], commessaId: string): boolean {
  return commesseAperteDelCliente.length === 1 && commesseAperteDelCliente[0] === commessaId;
}
