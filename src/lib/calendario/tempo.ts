// Date e ore sempre nel fuso di Roma, anche se il server (Vercel) gira in UTC.
export const ROMA = "Europe/Rome";

export type PartiRoma = { anno: number; mese: number; giorno: number; ora: number; minuto: number; dow: number };

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: ROMA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
});
const DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function partiRoma(d: Date): PartiRoma {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { anno: +p.year, mese: +p.month, giorno: +p.day, ora: +p.hour % 24, minuto: +p.minute, dow: DOW[p.weekday] };
}

const due = (n: number) => String(n).padStart(2, "0");

/** "2026-11-03" del giorno a Roma */
export function chiaveGiorno(d: Date): string {
  const p = partiRoma(d);
  return `${p.anno}-${due(p.mese)}-${due(p.giorno)}`;
}

/** Valore per <input type="datetime-local"> in ora di Roma */
export function perInput(d: Date): string {
  const p = partiRoma(d);
  return `${p.anno}-${due(p.mese)}-${due(p.giorno)}T${due(p.ora)}:${due(p.minuto)}`;
}

/** "2026-11-03T09:00" (ora di Roma, come arriva dai form) → istante esatto. Gestisce l'ora legale. */
export function daOraRoma(s: string | null | undefined): Date | null {
  const m = (s ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [y, mo, g, h = "0", mi = "0"] = m.slice(1).map((x) => x ?? "0");
  const voluto = Date.UTC(+y, +mo - 1, +g, +h, +mi);
  let t = voluto;
  for (let i = 0; i < 2; i++) {
    const p = partiRoma(new Date(t));
    const visto = Date.UTC(p.anno, p.mese - 1, p.giorno, p.ora, p.minuto);
    t += voluto - visto;
  }
  return new Date(t);
}

/** Mezzanotte di Roma del giorno "YYYY-MM-DD" */
export function inizioGiorno(chiave: string): Date {
  return daOraRoma(`${chiave}T00:00`)!;
}

export function aggiungiGiorni(chiave: string, n: number): string {
  const [y, m, g] = chiave.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, g + n));
  return `${d.getUTCFullYear()}-${due(d.getUTCMonth() + 1)}-${due(d.getUTCDate())}`;
}

/** 1 = lunedì … 7 = domenica */
export function giornoSettimana(chiave: string): number {
  const [y, m, g] = chiave.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, g)).getUTCDay();
  return w === 0 ? 7 : w;
}

export function lunediDi(chiave: string): string {
  return aggiungiGiorni(chiave, 1 - giornoSettimana(chiave));
}

/** Le 6 settimane (42 giorni) che coprono il mese di "chiave", a partire dal lunedì */
export function grigliaMese(chiave: string): string[] {
  const primo = `${chiave.slice(0, 7)}-01`;
  const da = lunediDi(primo);
  return Array.from({ length: 42 }, (_, i) => aggiungiGiorni(da, i));
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
export const nomeMese = (chiave: string) => `${MESI[+chiave.slice(5, 7) - 1]} ${chiave.slice(0, 4)}`;
export const nomeGiorno = (chiave: string) => GIORNI[giornoSettimana(chiave) - 1];
export const giornoBreve = (chiave: string) => `${nomeGiorno(chiave)} ${+chiave.slice(8, 10)} ${MESI[+chiave.slice(5, 7) - 1].slice(0, 3)}`;
export const oraRoma = (d: Date) => {
  const p = partiRoma(d);
  return `${due(p.ora)}:${due(p.minuto)}`;
};
