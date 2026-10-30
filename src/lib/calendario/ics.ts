// Generazione file calendario .ics (RFC 5545): inviti via email e link calendario personale.
export type VoceIcs = {
  uid: string;
  inizio: Date;
  fine: Date;
  giornataIntera?: boolean;
  titolo: string;
  descrizione?: string | null;
  luogo?: string | null;
  url?: string | null;
  annullato?: boolean;
  sequenza?: number;
  organizzatore?: { nome: string; email: string } | null;
  partecipanti?: { nome?: string | null; email: string }[];
  promemoriaMin?: number | null;
};

const due = (n: number) => String(n).padStart(2, "0");
export const dataUtc = (d: Date) =>
  `${d.getUTCFullYear()}${due(d.getUTCMonth() + 1)}${due(d.getUTCDate())}T${due(d.getUTCHours())}${due(d.getUTCMinutes())}${due(d.getUTCSeconds())}Z`;
const dataGiorno = (chiave: string) => chiave.replace(/-/g, "");

export function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Righe max 75 byte, continuazione con spazio iniziale */
export function piega(riga: string): string {
  const out: string[] = [];
  let cur = "";
  let byte = 0;
  for (const ch of riga) {
    const b = Buffer.byteLength(ch);
    if (byte + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      byte = 0;
    }
    cur += ch;
    byte += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function chiaveRoma(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function vevent(v: VoceIcs, metodo: "REQUEST" | "CANCEL" | "PUBLISH"): string[] {
  const r: string[] = ["BEGIN:VEVENT", `UID:${v.uid}`, `DTSTAMP:${dataUtc(new Date())}`, `SEQUENCE:${v.sequenza ?? 0}`];
  if (v.giornataIntera) {
    r.push(`DTSTART;VALUE=DATE:${dataGiorno(chiaveRoma(v.inizio))}`, `DTEND;VALUE=DATE:${dataGiorno(chiaveRoma(v.fine))}`);
  } else {
    r.push(`DTSTART:${dataUtc(v.inizio)}`, `DTEND:${dataUtc(v.fine)}`);
  }
  r.push(`SUMMARY:${escapeIcs(v.titolo)}`);
  if (v.luogo) r.push(`LOCATION:${escapeIcs(v.luogo)}`);
  const desc = [v.descrizione, v.url ? `Apri nel CRM: ${v.url}` : null].filter(Boolean).join("\n\n");
  if (desc) r.push(`DESCRIPTION:${escapeIcs(desc)}`);
  if (v.url) r.push(`URL:${v.url}`);
  if (v.organizzatore) r.push(`ORGANIZER;CN=${escapeIcs(v.organizzatore.nome)}:mailto:${v.organizzatore.email}`);
  for (const p of v.partecipanti ?? []) {
    r.push(`ATTENDEE;${p.nome ? `CN=${escapeIcs(p.nome)};` : ""}ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${p.email}`);
  }
  const annul = v.annullato || metodo === "CANCEL";
  r.push(`STATUS:${annul ? "CANCELLED" : "CONFIRMED"}`, "TRANSP:OPAQUE");
  if (!annul && v.promemoriaMin) {
    r.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeIcs(v.titolo)}`, `TRIGGER:-PT${v.promemoriaMin}M`, "END:VALARM");
  }
  r.push("END:VEVENT");
  return r;
}

export function calendarioIcs(voci: VoceIcs[], opz: { metodo?: "REQUEST" | "CANCEL" | "PUBLISH"; nome?: string } = {}): string {
  const metodo = opz.metodo ?? "PUBLISH";
  const r = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gruppo P&C//CRM//IT", "CALSCALE:GREGORIAN", `METHOD:${metodo}`];
  if (opz.nome) r.push(`X-WR-CALNAME:${escapeIcs(opz.nome)}`, "X-WR-TIMEZONE:Europe/Rome", "REFRESH-INTERVAL;VALUE=DURATION:PT15M", "X-PUBLISHED-TTL:PT15M");
  for (const v of voci) r.push(...vevent(v, metodo));
  r.push("END:VCALENDAR");
  return r.map(piega).join("\r\n") + "\r\n";
}
