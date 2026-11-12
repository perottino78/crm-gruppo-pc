// Client CalDAV minimo (Nextcloud): elenco dei calendari, lettura degli eventi di un periodo, scrittura e cancellazione.
// Autenticazione Basic con l'utente e la «password per app» di Nextcloud. Nessuna libreria: fetch e poche righe di XML.
import { leggiCalendari, leggiEventi, leggiMultistatus, type CalendarioDav, type EventoIcal } from "./ical";
import { dataUtc } from "./ics";

export type ConfigDav = { url: string; utente: string; password: string };

const base = (url: string) => url.trim().replace(/\/+$/, "").replace(/\/index\.php.*$/, "").replace(/\/remote\.php.*$/, "");
/** La cartella dei calendari dell'utente: <server>/remote.php/dav/calendars/<utente>/ */
export const cartellaCalendari = (c: ConfigDav) => `${base(c.url)}/remote.php/dav/calendars/${encodeURIComponent(c.utente)}/`;
/** Gli href di Nextcloud sono percorsi assoluti sul server: si completa con l'indirizzo. */
export const assoluto = (c: ConfigDav, href: string) => (/^https?:\/\//.test(href) ? href : `${new URL(base(c.url)).origin}${href.startsWith("/") ? "" : "/"}${href}`);

async function richiesta(c: ConfigDav, metodo: string, url: string, corpo?: string, intestazioni: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    method: metodo,
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.utente}:${c.password}`).toString("base64")}`,
      ...(corpo ? { "Content-Type": metodo === "PUT" ? "text/calendar; charset=utf-8" : "application/xml; charset=utf-8" } : {}),
      ...intestazioni,
    },
    body: corpo,
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
}

function errore(r: Response, cosa: string): Error {
  if (r.status === 401) return new Error(`${cosa}: utente o password per app non accettati da Nextcloud (401)`);
  if (r.status === 404) return new Error(`${cosa}: indirizzo non trovato (404). Controlla l'indirizzo del server e il nome utente`);
  return new Error(`${cosa}: Nextcloud ha risposto ${r.status} ${r.statusText}`);
}

/** I calendari dell'utente (anche quelli condivisi con lui). */
export async function elencaCalendari(c: ConfigDav): Promise<CalendarioDav[]> {
  const r = await richiesta(c, "PROPFIND", cartellaCalendari(c),
    `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><a:calendar-color/></d:prop></d:propfind>`,
    { Depth: "1" });
  if (r.status !== 207) throw errore(r, "Elenco dei calendari");
  return leggiCalendari(await r.text());
}

export type RisorsaDav = { href: string; etag: string | null; eventi: EventoIcal[] };

/** Gli eventi di un calendario fra due date (i ricorrenti già espansi dal server, una voce per volta). */
export async function leggiPeriodo(c: ConfigDav, calendario: string, da: Date, a: Date): Promise<RisorsaDav[]> {
  const t = `start="${dataUtc(da)}" end="${dataUtc(a)}"`;
  const r = await richiesta(c, "REPORT", assoluto(c, calendario),
    `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data><c:expand ${t}/></c:calendar-data></d:prop>` +
    `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range ${t}/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
    { Depth: "1" });
  if (r.status !== 207) throw errore(r, "Lettura del calendario");
  return leggiMultistatus(await r.text()).filter((x) => x.dati).map((x) => ({ href: x.href, etag: x.etag, eventi: leggiEventi(x.dati!) }));
}

/** Scrive (crea o sostituisce) un evento: ritorna href ed etag nuovi. */
export async function scriviEvento(c: ConfigDav, calendario: string, uid: string, ics: string, hrefEsistente?: string | null): Promise<{ href: string; etag: string | null }> {
  const href = hrefEsistente ?? `${calendario.replace(/\/?$/, "/")}${encodeURIComponent(uid)}.ics`;
  const r = await richiesta(c, "PUT", assoluto(c, href), ics);
  if (![200, 201, 204].includes(r.status)) throw errore(r, "Scrittura dell'evento");
  let etag = r.headers.get("etag");
  if (!etag) {
    const p = await richiesta(c, "PROPFIND", assoluto(c, href), `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>`, { Depth: "0" });
    etag = p.status === 207 ? leggiMultistatus(await p.text())[0]?.etag ?? null : null;
  }
  return { href: new URL(assoluto(c, href)).pathname, etag };
}

/** Cancella un evento (se non c'è già più va bene lo stesso). */
export async function cancellaEvento(c: ConfigDav, href: string): Promise<void> {
  const r = await richiesta(c, "DELETE", assoluto(c, href));
  if (![200, 204, 404, 410].includes(r.status)) throw errore(r, "Cancellazione dell'evento");
}

/** C'è ancora? (per non annullare un appuntamento solo perché non è arrivato nella lettura del periodo) */
export async function esisteEvento(c: ConfigDav, href: string): Promise<boolean> {
  const r = await richiesta(c, "GET", assoluto(c, href));
  return r.status !== 404 && r.status !== 410;
}
