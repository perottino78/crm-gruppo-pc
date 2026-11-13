// Lettura degli eventi dei calendari Nextcloud (CalDAV) e regole della sincronizzazione con P&C ONE. Funzioni pure, testate in
// tests/calendario/nextcloud.test.ts.
import { daOraRoma } from "./tempo";
import { stessaPersona } from "@/lib/provvigioni/calcoli";

export type EventoIcal = {
  uid: string; titolo: string; inizio: Date; fine: Date; giornataIntera: boolean;
  luogo: string | null; note: string | null; annullato: boolean; ricorrenza: string | null;
};

/** Righe del file .ics, con le continuazioni (riga che inizia con spazio) riunite. */
function righe(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/).filter(Boolean);
}
const testo = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");

/** Data di una proprietà iCal: UTC («Z»), ora locale con TZID (trattata come ora di Roma) o giorno intero. */
export function leggiData(param: string, valore: string): { d: Date; giorno: boolean } | null {
  const g = valore.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (g || /VALUE=DATE(?!-)/i.test(param)) {
    const m = valore.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    const d = daOraRoma(`${m[1]}-${m[2]}-${m[3]}T00:00`);
    return d ? { d, giorno: true } : null;
  }
  const m = valore.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  if (m[7]) return { d: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])), giorno: false };
  const d = daOraRoma(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`);
  return d ? { d, giorno: false } : null;
}

/** Durata ISO (es. PT1H30M, P1D) in millisecondi. */
export function durataMs(s: string): number {
  const m = s.match(/^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, w, d, h, mi, se] = m.map((x) => Number(x || 0));
  return ((((w * 7 + d) * 24 + h) * 60 + mi) * 60 + se) * 1000;
}

/** Gli eventi (VEVENT) di un file .ics. Gli eventi ricorrenti arrivano già «espansi» dal server (una voce per volta). */
export function leggiEventi(ics: string): EventoIcal[] {
  const out: EventoIcal[] = [];
  let cur: Record<string, { param: string; valore: string }> | null = null;
  let dentroAllarme = false;
  for (const r of righe(ics)) {
    if (r === "BEGIN:VEVENT") { cur = {}; continue; }
    if (r === "BEGIN:VALARM") { dentroAllarme = true; continue; }
    if (r === "END:VALARM") { dentroAllarme = false; continue; }
    if (r === "END:VEVENT" && cur) {
      const ini = cur.DTSTART && leggiData(cur.DTSTART.param, cur.DTSTART.valore);
      if (ini && cur.UID) {
        const fin = cur.DTEND ? leggiData(cur.DTEND.param, cur.DTEND.valore) : null;
        const fine = fin?.d ?? new Date(ini.d.getTime() + (cur.DURATION ? durataMs(cur.DURATION.valore) : ini.giorno ? 86_400_000 : 3_600_000));
        out.push({
          uid: cur.UID.valore, titolo: testo(cur.SUMMARY?.valore ?? "(senza titolo)"), inizio: ini.d, fine: fine > ini.d ? fine : new Date(ini.d.getTime() + 3_600_000),
          giornataIntera: ini.giorno, luogo: cur.LOCATION ? testo(cur.LOCATION.valore) : null, note: cur.DESCRIPTION ? testo(cur.DESCRIPTION.valore) : null,
          annullato: cur.STATUS?.valore.toUpperCase() === "CANCELLED", ricorrenza: cur["RECURRENCE-ID"]?.valore ?? null,
        });
      }
      cur = null;
      continue;
    }
    if (!cur || dentroAllarme) continue;
    const i = r.indexOf(":");
    if (i < 0) continue;
    const [nome, ...param] = r.slice(0, i).split(";");
    const k = nome.toUpperCase();
    if (!(k in cur)) cur[k] = { param: param.join(";"), valore: r.slice(i + 1) };
  }
  return out;
}

export type RispostaCaldav = { href: string; etag: string | null; dati: string | null; stato: number };

/** Le risposte di un PROPFIND/REPORT CalDAV (multistatus XML): href, etag, calendar-data. Lettura semplice, senza librerie. */
export function leggiMultistatus(xml: string): RispostaCaldav[] {
  const out: RispostaCaldav[] = [];
  const decodifica = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#13;/g, "\r").replace(/&#10;/g, "\n").replace(/&amp;/g, "&");
  for (const blocco of xml.split(/<(?:[a-z0-9]+:)?response[\s>]/i).slice(1)) {
    const tag = (nome: string) => blocco.match(new RegExp(`<(?:[a-z0-9]+:)?${nome}[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${nome}>`, "i"))?.[1] ?? null;
    const href = tag("href");
    if (!href) continue;
    const stato = Number(tag("status")?.match(/\s(\d{3})\s/)?.[1] ?? 200);
    const etag = tag("getetag");
    const dati = tag("calendar-data");
    out.push({ href: decodifica(href).trim(), etag: etag ? decodifica(etag).trim() : null, dati: dati ? decodifica(dati) : null, stato });
  }
  return out;
}

export type CalendarioDav = { href: string; nome: string; colore: string | null };

/** I calendari di un utente (PROPFIND Depth 1 sulla sua cartella): solo le raccolte con resourcetype «calendar» che contengono eventi. */
export function leggiCalendari(xml: string): CalendarioDav[] {
  const out: CalendarioDav[] = [];
  for (const blocco of xml.split(/<(?:[a-z0-9]+:)?response[\s>]/i).slice(1)) {
    const tipo = blocco.match(/<(?:[a-z0-9]+:)?resourcetype[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?resourcetype>/i)?.[1] ?? "";
    if (!/<(?:[a-z0-9]+:)?calendar[\s/>]/i.test(tipo)) continue;
    const comp = blocco.match(/supported-calendar-component-set[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?supported-calendar-component-set>/i)?.[1];
    if (comp && !/name="VEVENT"/i.test(comp)) continue;
    const href = blocco.match(/<(?:[a-z0-9]+:)?href>([\s\S]*?)<\/(?:[a-z0-9]+:)?href>/i)?.[1]?.trim();
    if (!href) continue;
    const nome = blocco.match(/<(?:[a-z0-9]+:)?displayname[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?displayname>/i)?.[1]?.trim() || decodeURIComponent(href.split("/").filter(Boolean).pop() ?? href);
    const colore = blocco.match(/calendar-color[^>]*>([^<]*)</i)?.[1]?.trim() || null;
    out.push({ href, nome: nome.replace(/&amp;/g, "&"), colore });
  }
  return out;
}

/** Nome della persona dal nome del calendario: «Marco Piccatti BCONSOLE» → «Marco Piccatti»; «Massimo+Porcu+BCONSOLE+%28Importazione+Google+Calendar%29» → «Massimo Porcu». */
export function personaDelCalendario(nome: string): string {
  let n = nome.replace(/\+/g, " ");
  try { n = decodeURIComponent(n); } catch { /* nome con un «%» vero: resta com'è */ }
  // «Paolo Visconti BCONSOLE (Importazione Google Calendar)»: la parte fra parentesi non è il nome
  return n.replace(/\([^)]*\)/g, " ").replace(/\b(bconsole|finale|calendario|calendar|crm|p&c one)\b/gi, " ").replace(/\s+/g, " ").trim();
}

/** Proposta di abbinamento calendario → persona del team (stesso nome in qualsiasi ordine, anche più corto). */
export function abbinaCalendario(nome: string, utenti: { id: string; nome: string }[]): string | null {
  const p = personaDelCalendario(nome);
  const trovati = utenti.filter((u) => stessaPersona(u.nome, p));
  return trovati.length === 1 ? trovati[0].id : null;
}

/** UID degli impegni scritti da P&C ONE nei calendari: «one-appuntamento-<id>@crm-gruppo-pc». */
export const uidOne = (chiave: string) => `one-${chiave.replace(/:/g, "-").toLowerCase()}@crm-gruppo-pc`;
export const eDiOne = (uid: string) => /^one-.+@crm-gruppo-pc$/.test(uid);
/** Dall'UID di P&C ONE torna la chiave dell'impegno («APPUNTAMENTO:<id>»); gli id sono cuid minuscoli. */
export function chiaveDaUid(uid: string): string | null {
  const m = uid.match(/^one-(appuntamento|rilievo|posa|assistenza|riunione)-(.+?)@crm-gruppo-pc$/);
  return m ? `${m[1].toUpperCase()}:${m[2]}` : null;
}

/**
 * Impegni esterni da mostrare in P&C ONE: si scartano quelli che doppiano un impegno già in P&C ONE della stessa persona
 * (stesso inizio entro 30 minuti), ad es. gli appuntamenti di BConsole già importati che BConsole scrive anche su Nextcloud.
 */
export function esterniDaMostrare<T extends { utenteId: string; inizio: Date }>(esterni: T[], nostri: { utenteId?: string | null; inizio: Date }[]): T[] {
  return esterni.filter((e) => !nostri.some((n) => n.utenteId === e.utenteId && Math.abs(n.inizio.getTime() - e.inizio.getTime()) <= 30 * 60_000));
}

/** Cosa fare con un impegno di P&C ONE già scritto su Nextcloud, confrontando l'etag salvato con quello che c'è adesso. */
export function decisione(o: { etagSalvato: string | null; etagNextcloud: string | null; esisteSuNextcloud: boolean; impronta: string; improntaSalvata: string | null }):
  "CREA" | "AGGIORNA_NEXTCLOUD" | "PRENDI_DA_NEXTCLOUD" | "CANCELLATO_SU_NEXTCLOUD" | "NIENTE" {
  if (!o.etagSalvato) return o.esisteSuNextcloud ? "PRENDI_DA_NEXTCLOUD" : "CREA";
  if (!o.esisteSuNextcloud) return "CANCELLATO_SU_NEXTCLOUD";
  if (o.etagNextcloud && o.etagNextcloud !== o.etagSalvato) return "PRENDI_DA_NEXTCLOUD";
  return o.impronta !== o.improntaSalvata ? "AGGIORNA_NEXTCLOUD" : "NIENTE";
}
