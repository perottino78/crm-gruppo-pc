// Google Calendar (account amministrazione, richiesta di Ugo 13/11/2026): regole pure del collegamento nei due sensi. Testate in
// tests/calendario/google.test.ts.
// - Si usano solo i calendari con «BCONSOLE» nel nome, abbinati alle persone attive (se ce ne sono due per la stessa persona vince «finale»).
// - Google → P&C ONE: gli impegni scritti su Google (anche «occupato») si vedono in P&C ONE in sola lettura e contano nei giorni pieni.
// - P&C ONE → Google: solo gli appuntamenti e le riunioni creati in P&C ONE dal giorno del collegamento (non quelli portati da BConsole,
//   che su Google ci sono già); vince P&C ONE. Gli impegni di Google non scritti da P&C ONE non si toccano mai.
import { createHash } from "crypto";
import { abbinaCalendario, personaDelCalendario } from "./ical";

export type CalendarioGoogle = { id: string; nome: string; accesso?: string | null };
export type CalendarioGoogleAbbinato = { id: string; nome: string; utenteId: string | null; scrivi: boolean };

/** Solo i calendari con «bconsole» nel nome (maiuscole o minuscole). */
export const calendariBconsole = <T extends { nome: string }>(c: T[]) => c.filter((x) => /bconsole/i.test(x.nome));

/**
 * Proposta di abbinamento: calendario → persona attiva (stesso nome in qualsiasi ordine). Se una persona ha più calendari BCONSOLE
 * vince quello con «finale» nel nome (il più recente, usato oggi dai commerciali), gli altri restano senza persona.
 * Gli abbinamenti già salvati (anche fatti a mano) si tengono.
 */
export function proponiAbbinamenti(calendari: CalendarioGoogle[], utenti: { id: string; nome: string }[], prima: CalendarioGoogleAbbinato[] = []): CalendarioGoogleAbbinato[] {
  const salvati = new Map(prima.map((p) => [p.id, p]));
  const proposti = calendariBconsole(calendari).map((c) => salvati.get(c.id) ? { ...salvati.get(c.id)!, nome: c.nome } : { id: c.id, nome: c.nome, utenteId: abbinaCalendario(c.nome, utenti), scrivi: true });
  // una sola persona per calendario «automatico»: se ce ne sono due, quello con «finale»
  const perPersona = new Map<string, CalendarioGoogleAbbinato[]>();
  for (const c of proposti) if (c.utenteId && !salvati.has(c.id)) perPersona.set(c.utenteId, [...(perPersona.get(c.utenteId) ?? []), c]);
  for (const lista of perPersona.values()) {
    if (lista.length < 2) continue;
    const buono = lista.find((c) => /finale/i.test(c.nome)) ?? lista[0];
    for (const c of lista) if (c !== buono) { c.utenteId = null; c.scrivi = false; }
  }
  return proposti;
}
export { personaDelCalendario };

/** Id dell'evento Google scritto da P&C ONE (caratteri base32hex: 0-9 e a-v): sempre lo stesso per lo stesso impegno. */
export const idGoogleDi = (chiave: string) => `one${createHash("sha1").update(chiave).digest("hex")}`;

export type EventoOne = { chiave: string; titolo: string; inizio: Date; fine: Date; giornataIntera: boolean; luogo?: string | null; note?: string | null; cliente?: string | null };
const giorno = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

/** Il corpo dell'evento per l'API di Google e la sua impronta (per non riscrivere se non è cambiato niente). */
export function corpoGoogle(e: EventoOne): { corpo: Record<string, unknown>; impronta: string } {
  const corpo = {
    summary: e.cliente && !e.titolo.includes(e.cliente) ? `${e.titolo} — ${e.cliente}` : e.titolo,
    location: e.luogo ?? undefined,
    description: [e.note, "Impegno di P&C ONE: per spostarlo o annullarlo usa P&C ONE (le modifiche fatte qui vengono riportate come in P&C ONE)."].filter(Boolean).join("\n\n"),
    start: e.giornataIntera ? { date: giorno(e.inizio) } : { dateTime: e.inizio.toISOString(), timeZone: "Europe/Rome" },
    end: e.giornataIntera ? { date: giorno(e.fine) } : { dateTime: e.fine.toISOString(), timeZone: "Europe/Rome" },
    extendedProperties: { private: { one: e.chiave } },
    reminders: { useDefault: false, overrides: e.giornataIntera ? [] : [{ method: "popup", minutes: 60 }] },
  };
  return { corpo, impronta: createHash("sha1").update(JSON.stringify(corpo)).digest("hex") };
}

export type ElementoGoogle = {
  id: string; etag?: string; status?: string; summary?: string; location?: string; description?: string; transparency?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
};
export type EventoDaGoogle = { id: string; etag: string | null; titolo: string; inizio: Date; fine: Date; giornataIntera: boolean; luogo: string | null; note: string | null; annullato: boolean; chiaveOne: string | null; libero: boolean };

/** Mezzanotte di Roma del giorno «AAAA-MM-GG» (gli eventi di tutto il giorno di Google sono date senza ora). */
function mezzanotteRoma(d: string): Date {
  const utc = new Date(`${d}T00:00:00Z`);
  const ore = Number(utc.toLocaleString("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false })) % 24;
  return new Date(utc.getTime() - ore * 3600_000);
}

export function daElementoGoogle(x: ElementoGoogle): EventoDaGoogle | null {
  const tutto = !!x.start?.date;
  const inizio = tutto ? mezzanotteRoma(x.start!.date!) : x.start?.dateTime ? new Date(x.start.dateTime) : null;
  if (!inizio || isNaN(inizio.getTime())) return null;
  const fineGrezza = tutto ? (x.end?.date ? mezzanotteRoma(x.end.date) : new Date(inizio.getTime() + 86_400_000)) : x.end?.dateTime ? new Date(x.end.dateTime) : new Date(inizio.getTime() + 3_600_000);
  return {
    id: x.id, etag: x.etag ?? null, titolo: (x.summary || "(occupato)").slice(0, 300), inizio, fine: fineGrezza > inizio ? fineGrezza : new Date(inizio.getTime() + 3_600_000),
    giornataIntera: tutto, luogo: x.location ?? null, note: x.description?.slice(0, 2000) ?? null, annullato: x.status === "cancelled",
    chiaveOne: x.extendedProperties?.private?.one ?? null, libero: x.transparency === "transparent",
  };
}

/** Si scrive su Google? Solo appuntamenti e riunioni nati in P&C ONE (non importati da BConsole) dal giorno del collegamento. */
export function daScrivere(x: { tipo: string; creatoIl: Date | null; importato: boolean }, dal: Date | null): boolean {
  if (!dal || !x.creatoIl || x.importato) return false;
  return (x.tipo === "APPUNTAMENTO" || x.tipo === "RIUNIONE") && x.creatoIl.getTime() >= dal.getTime();
}

/** Cosa fare con un impegno di P&C ONE: P&C ONE vince sempre (spostato o cancellato su Google → si riscrive com'è in P&C ONE). */
export function azioneGoogle(o: { annullatoInOne: boolean; suGoogle: boolean; etagSalvato: string | null; etagGoogle: string | null; impronta: string; improntaSalvata: string | null }): "SCRIVI" | "CANCELLA" | "NIENTE" {
  if (o.annullatoInOne) return o.suGoogle || o.etagSalvato ? "CANCELLA" : "NIENTE";
  if (!o.suGoogle) return "SCRIVI";
  if (!o.etagSalvato || o.etagGoogle !== o.etagSalvato || o.impronta !== o.improntaSalvata) return "SCRIVI";
  return "NIENTE";
}
