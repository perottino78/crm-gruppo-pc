// Collegamento con Google Calendar (account amministrazione) nei due sensi: accesso OAuth, elenco calendari, lettura e scrittura.
// Regole in googlecal.ts (pure). La configurazione sta in Configurazione (chiavi google_*; client secret e refresh token cifrati).
// Gli impegni letti da Google stanno in EventoNextcloud (cache degli impegni dei calendari esterni) con calendario «google:<id>».
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { cifra, decifra } from "@/lib/mail/caselle";
import { APP_URL } from "@/lib/mail/invio";
import { eventiPeriodo } from "./server";
import { azioneGoogle, corpoGoogle, daElementoGoogle, daScrivere, idGoogleDi, proponiAbbinamenti, type CalendarioGoogle, type CalendarioGoogleAbbinato, type ElementoGoogle } from "./googlecal";

export const CHIAVI_GOOGLE = {
  clientId: "google_client_id", clientSecret: "google_client_secret", refresh: "google_refresh", email: "google_email",
  calendari: "google_calendari", dal: "google_dal", stato: "google_stato", ultima: "google_ultima",
} as const;
export type StatoGoogle = { il: string; ok: boolean; messaggio: string };

// indirizzi di Google (nei collaudi un server simulato)
const OAUTH = () => process.env.GOOGLE_OAUTH_BASE || "https://oauth2.googleapis.com";
const API = () => process.env.GOOGLE_API_BASE || "https://www.googleapis.com";
const AUTH = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
export const REDIRECT_GOOGLE = () => `${process.env.GOOGLE_REDIRECT_BASE || APP_URL}/api/google/callback`;
const SCOPE = "https://www.googleapis.com/auth/calendar openid email";

const leggi = async (k: string) => (await prisma.configurazione.findUnique({ where: { chiave: k } }))?.valore ?? null;
const scrivi = (k: string, valore: string) => prisma.configurazione.upsert({ where: { chiave: k }, update: { valore }, create: { chiave: k, valore } });
const json = <T,>(s: string | null, d: T): T => { try { return s ? JSON.parse(s) as T : d; } catch { return d; } };

export async function configGoogle() {
  const r = Object.fromEntries((await prisma.configurazione.findMany({ where: { chiave: { in: Object.values(CHIAVI_GOOGLE) } } })).map((c) => [c.chiave, c.valore]));
  const clientSecret = decifra(r[CHIAVI_GOOGLE.clientSecret]);
  const refresh = decifra(r[CHIAVI_GOOGLE.refresh]);
  return {
    clientId: r[CHIAVI_GOOGLE.clientId] ?? null, haSecret: !!clientSecret, clientSecret, refresh, collegato: !!(refresh && clientSecret && r[CHIAVI_GOOGLE.clientId]),
    email: r[CHIAVI_GOOGLE.email] ?? null, calendari: json<CalendarioGoogleAbbinato[]>(r[CHIAVI_GOOGLE.calendari] ?? null, []),
    dal: r[CHIAVI_GOOGLE.dal] ? new Date(r[CHIAVI_GOOGLE.dal]) : null, stato: json<StatoGoogle | null>(r[CHIAVI_GOOGLE.stato] ?? null, null),
  };
}
export async function salvaCredenzialiGoogle(clientId: string, clientSecret: string | null) {
  await scrivi(CHIAVI_GOOGLE.clientId, clientId.trim());
  if (clientSecret) await scrivi(CHIAVI_GOOGLE.clientSecret, cifra(clientSecret.trim()));
}
export const salvaCalendariGoogle = (c: CalendarioGoogleAbbinato[]) => scrivi(CHIAVI_GOOGLE.calendari, JSON.stringify(c));

// --- accesso (OAuth) -----------------------------------------------------------------------------------------------------------
const SEGRETO = () => process.env.SESSION_SECRET || "gpc-2026-session-secret-x7f2-cambiami-in-produzione";
export const statoOAuth = (utenteId: string, adesso = Date.now()) => { const p = `${utenteId}.${adesso}`; return `${p}.${createHmac("sha256", SEGRETO()).update(`google:${p}`).digest("hex").slice(0, 24)}`; };
export function verificaStatoOAuth(stato: string, adesso = Date.now()): string | null {
  const [id, t, f] = stato.split(".");
  if (!id || !t || !f || createHmac("sha256", SEGRETO()).update(`google:${id}.${t}`).digest("hex").slice(0, 24) !== f) return null;
  return adesso - Number(t) < 30 * 60_000 ? id : null; // valido 30 minuti
}
export function urlConsenso(clientId: string, stato: string) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT_GOOGLE(), response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", state: stato, include_granted_scopes: "true" });
  return `${AUTH()}?${q}`;
}
/** Scambia il codice del consenso con il refresh token e legge l'email dell'account. */
export async function completaConsenso(code: string): Promise<{ ok: true; email: string | null } | { ok: false; errore: string }> {
  const cfg = await configGoogle();
  if (!cfg.clientId || !cfg.clientSecret) return { ok: false, errore: "Mancano Client ID e Client secret" };
  const r = await fetch(`${OAUTH()}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: REDIRECT_GOOGLE(), grant_type: "authorization_code" }), signal: AbortSignal.timeout(20_000) });
  const j = await r.json().catch(() => ({})) as { refresh_token?: string; id_token?: string; access_token?: string; error?: string; error_description?: string };
  if (!r.ok || !j.refresh_token) return { ok: false, errore: j.error_description || j.error || (j.access_token ? "Google non ha dato l'accesso permanente: scollega l'app da myaccount.google.com › Sicurezza e riprova" : `Google ha risposto ${r.status}`) };
  let email: string | null = null;
  try { email = JSON.parse(Buffer.from((j.id_token ?? "").split(".")[1] ?? "", "base64url").toString()).email ?? null; } catch { /* niente email */ }
  await scrivi(CHIAVI_GOOGLE.refresh, cifra(j.refresh_token));
  if (email) await scrivi(CHIAVI_GOOGLE.email, email);
  if (!(await leggi(CHIAVI_GOOGLE.dal))) await scrivi(CHIAVI_GOOGLE.dal, new Date().toISOString()); // si scrive su Google solo da qui in avanti
  accesso = null;
  return { ok: true, email };
}

let accesso: { token: string; scade: number } | null = null;
async function tokenAccesso(): Promise<string> {
  if (accesso && accesso.scade > Date.now() + 60_000) return accesso.token;
  const cfg = await configGoogle();
  if (!cfg.collegato) throw new Error("Google non collegato");
  const r = await fetch(`${OAUTH()}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cfg.clientId!, client_secret: cfg.clientSecret!, refresh_token: cfg.refresh!, grant_type: "refresh_token" }), signal: AbortSignal.timeout(20_000) });
  const j = await r.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(j.error === "invalid_grant" ? "l'accesso a Google è scaduto o è stato tolto: premi di nuovo «Collega Google»" : `accesso a Google non riuscito (${j.error_description || j.error || r.status})`);
  accesso = { token: j.access_token, scade: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return accesso.token;
}

async function api(metodo: string, percorso: string, corpo?: unknown): Promise<Response> {
  const t = await tokenAccesso();
  return fetch(`${API()}/calendar/v3${percorso}`, { method: metodo, headers: { Authorization: `Bearer ${t}`, ...(corpo ? { "Content-Type": "application/json" } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(20_000) });
}
const errore = async (r: Response, cosa: string) => new Error(`${cosa}: Google ha risposto ${r.status} ${(await r.text().catch(() => "")).slice(0, 160)}`);

export async function elencaCalendariGoogle(): Promise<CalendarioGoogle[]> {
  const out: CalendarioGoogle[] = [];
  let pagina = "";
  do {
    const r = await api("GET", `/users/me/calendarList?maxResults=250${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ""}`);
    if (!r.ok) throw await errore(r, "Elenco dei calendari");
    const j = await r.json() as { items?: { id: string; summary?: string; summaryOverride?: string; accessRole?: string }[]; nextPageToken?: string };
    out.push(...(j.items ?? []).map((c) => ({ id: c.id, nome: c.summaryOverride || c.summary || c.id, accesso: c.accessRole ?? null })));
    pagina = j.nextPageToken ?? "";
  } while (pagina);
  return out;
}

async function leggiEventi(calId: string, da: Date, a: Date): Promise<ElementoGoogle[]> {
  const out: ElementoGoogle[] = [];
  let pagina = "";
  do {
    const q = new URLSearchParams({ timeMin: da.toISOString(), timeMax: a.toISOString(), singleEvents: "true", maxResults: "2500", showDeleted: "false", ...(pagina ? { pageToken: pagina } : {}) });
    const r = await api("GET", `/calendars/${encodeURIComponent(calId)}/events?${q}`);
    if (!r.ok) throw await errore(r, "Lettura del calendario");
    const j = await r.json() as { items?: ElementoGoogle[]; nextPageToken?: string };
    out.push(...(j.items ?? []));
    pagina = j.nextPageToken ?? "";
  } while (pagina);
  return out;
}
/** Crea o sostituisce l'evento di P&C ONE (id fisso): prima prova a sostituirlo, se non c'è lo crea. Ritorna l'etag. */
async function scriviEvento(calId: string, id: string, corpo: Record<string, unknown>): Promise<string | null> {
  let r = await api("PUT", `/calendars/${encodeURIComponent(calId)}/events/${id}`, { ...corpo, status: "confirmed" });
  if (r.status === 404) r = await api("POST", `/calendars/${encodeURIComponent(calId)}/events`, { ...corpo, id });
  if (!r.ok) throw await errore(r, "Scrittura dell'evento");
  return ((await r.json().catch(() => ({}))) as { etag?: string }).etag ?? null;
}
async function cancellaEvento(calId: string, id: string) {
  const r = await api("DELETE", `/calendars/${encodeURIComponent(calId)}/events/${id}`);
  if (![200, 204, 404, 410].includes(r.status)) throw await errore(r, "Cancellazione dell'evento");
}

// --- sincronizzazione ------------------------------------------------------------------------------------------------------------
export type EsitoGoogle = { fatto: boolean; motivo?: string; scritti?: number; tolti?: number; esterni?: number; errori?: string[] };
let inCorso: Promise<EsitoGoogle> | null = null;
const calKey = (id: string) => `google:${id}`;

/** Propone (o aggiorna) l'abbinamento dei calendari BCONSOLE alle persone attive, tenendo quelli già salvati. */
export async function aggiornaCalendariGoogle() {
  const cfg = await configGoogle();
  const utenti = await prisma.utente.findMany({ where: { stato: "ATTIVO" }, select: { id: true, nome: true } });
  const cal = proponiAbbinamenti(await elencaCalendariGoogle(), utenti, cfg.calendari);
  await salvaCalendariGoogle(cal);
  return cal;
}

/**
 * Sincronizzazione (da 7 giorni fa a 4 mesi avanti), al massimo ogni 5 minuti salvo `forza`. Non lancia errori: il risultato va in
 * google_stato e si vede in Impostazioni › Google Calendar.
 */
export async function sincronizzaGoogle(opz: { forza?: boolean; adesso?: Date } = {}): Promise<EsitoGoogle> {
  if (inCorso) return inCorso;
  inCorso = (async (): Promise<EsitoGoogle> => {
    const ora = opz.adesso ?? new Date();
    const cfg = await configGoogle();
    if (!cfg.collegato) return { fatto: false, motivo: "Google non collegato" };
    if (!opz.forza) {
      const ultima = await leggi(CHIAVI_GOOGLE.ultima);
      if (ultima && ora.getTime() - Number(ultima) < 5 * 60_000) return { fatto: false, motivo: "fatta da poco" };
    }
    await scrivi(CHIAVI_GOOGLE.ultima, String(ora.getTime()));
    const da = new Date(ora.getTime() - 7 * 86_400_000), a = new Date(ora.getTime() + 120 * 86_400_000);
    const r = { scritti: 0, tolti: 0, esterni: 0, errori: [] as string[] };
    // accesso prima di tutto: se manca, un solo messaggio invece di uno per calendario
    try { await tokenAccesso(); }
    catch (e) {
      const messaggio = `Problemi: ${e instanceof Error ? e.message : String(e)}`;
      await scrivi(CHIAVI_GOOGLE.stato, JSON.stringify({ il: ora.toISOString(), ok: false, messaggio } satisfies StatoGoogle));
      return { fatto: true, ...r, errori: [messaggio] };
    }
    for (const cal of cfg.calendari.filter((c) => c.utenteId)) {
      try {
        const remoti = (await leggiEventi(cal.id, da, a)).map((x) => ({ x, e: daElementoGoogle(x) })).filter((y): y is { x: ElementoGoogle; e: NonNullable<ReturnType<typeof daElementoGoogle>> } => !!y.e);
        // 1) impegni scritti su Google da altri (BConsole, il commerciale «occupato»…): sola lettura in P&C ONE
        const esterni = remoti.filter(({ e }) => !e.chiaveOne && !e.annullato && !e.libero);
        const visti: string[] = [];
        for (const { x, e } of esterni) {
          const href = `${calKey(cal.id)}:${x.id}`;
          visti.push(href);
          const dati = { calendario: calKey(cal.id), uid: x.id, etag: e.etag, utenteId: cal.utenteId!, chiave: null, titolo: e.titolo, inizio: e.inizio, fine: e.fine, giornataIntera: e.giornataIntera, luogo: e.luogo, note: e.note };
          await prisma.eventoNextcloud.upsert({ where: { href }, update: dati, create: { href, ...dati } });
        }
        r.esterni += esterni.length;
        await prisma.eventoNextcloud.deleteMany({ where: { calendario: calKey(cal.id), chiave: null, href: { notIn: visti }, inizio: { gte: da, lt: a } } });
        if (!cal.scrivi) continue;

        // 2) appuntamenti e riunioni nati in P&C ONE dal collegamento: P&C ONE → Google (vince P&C ONE)
        const nostri = (await eventiPeriodo({ da, a, utenteId: cal.utenteId, tipi: ["APPUNTAMENTO", "RIUNIONE"] })).filter((e) => e.utenteId === cal.utenteId);
        const idsApp = nostri.filter((e) => e.tipo === "APPUNTAMENTO").map((e) => e.id.split(":")[1]);
        const idsRiu = nostri.filter((e) => e.tipo === "RIUNIONE").map((e) => e.id.split(":")[1]);
        const [apps, riu] = await Promise.all([
          prisma.appuntamento.findMany({ where: { id: { in: idsApp } }, select: { id: true, createdAt: true, chiaveImport: true } }),
          prisma.riunione.findMany({ where: { id: { in: idsRiu } }, select: { id: true, createdAt: true } }),
        ]);
        const info = new Map<string, { creatoIl: Date; importato: boolean }>([...apps.map((x) => [`APPUNTAMENTO:${x.id}`, { creatoIl: x.createdAt, importato: !!x.chiaveImport }] as const), ...riu.map((x) => [`RIUNIONE:${x.id}`, { creatoIl: x.createdAt, importato: false }] as const)]);
        const salvati = new Map((await prisma.eventoNextcloud.findMany({ where: { calendario: calKey(cal.id), chiave: { not: null } } })).map((s) => [s.chiave!, s]));
        const remotiOne = new Map(remoti.filter(({ e }) => e.chiaveOne).map((y) => [y.e.chiaveOne!, y]));
        const presenti = new Set<string>();
        for (const ev of nostri) {
          const chiave = ev.tipo === "RIUNIONE" ? ev.id.split(":").slice(0, 2).join(":") : ev.id;
          const i = info.get(chiave);
          if (!daScrivere({ tipo: ev.tipo, creatoIl: i?.creatoIl ?? null, importato: i?.importato ?? true }, cfg.dal)) continue;
          presenti.add(chiave);
          const s = salvati.get(chiave);
          const rem = remotiOne.get(chiave);
          const { corpo, impronta } = corpoGoogle({ chiave, titolo: ev.titolo, inizio: ev.inizio, fine: ev.fine, giornataIntera: ev.giornataIntera, luogo: ev.luogo, note: ev.note, cliente: ev.cliente });
          const az = azioneGoogle({ annullatoInOne: /^ANNULLAT/.test(ev.stato), suGoogle: !!rem && !rem.e.annullato, etagSalvato: s?.etag ?? null, etagGoogle: rem?.e.etag ?? null, impronta, improntaSalvata: s?.impronta ?? null });
          const id = idGoogleDi(chiave);
          if (az === "CANCELLA") {
            await cancellaEvento(cal.id, id);
            if (s) await prisma.eventoNextcloud.delete({ where: { id: s.id } });
            r.tolti++;
          } else if (az === "SCRIVI") {
            const etag = await scriviEvento(cal.id, id, corpo);
            const dati = { calendario: calKey(cal.id), href: `${calKey(cal.id)}:${id}`, uid: id, etag, utenteId: cal.utenteId!, chiave, impronta, titolo: ev.titolo.slice(0, 300), inizio: ev.inizio, fine: ev.fine, giornataIntera: ev.giornataIntera, luogo: ev.luogo ?? null, note: null };
            if (s) await prisma.eventoNextcloud.update({ where: { id: s.id }, data: dati });
            else await prisma.eventoNextcloud.upsert({ where: { href: dati.href }, update: dati, create: dati });
            r.scritti++;
          }
        }
        // 3) scritti da P&C ONE ma non più di questa persona (passati a un collega, eliminati): via da questo calendario
        for (const s of salvati.values()) {
          if (presenti.has(s.chiave!) || s.inizio < da || s.inizio >= a) continue;
          await cancellaEvento(cal.id, s.uid);
          await prisma.eventoNextcloud.delete({ where: { id: s.id } });
          r.tolti++;
        }
      } catch (e) {
        r.errori.push(`${cal.nome}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const messaggio = r.errori.length ? `Problemi: ${r.errori.join(" · ")}` : `${r.esterni} impegni letti da Google · scritti ${r.scritti}, tolti ${r.tolti}`;
    await scrivi(CHIAVI_GOOGLE.stato, JSON.stringify({ il: ora.toISOString(), ok: !r.errori.length, messaggio } satisfies StatoGoogle));
    return { fatto: true, ...r };
  })().finally(() => { inCorso = null; });
  return inCorso;
}

/** Dopo un cambio in P&C ONE: sincronizza subito, dopo aver risposto (fuori da una richiesta ci pensa il controllo periodico). */
export async function sincronizzaGoogleDopoRisposta() {
  try {
    const { after } = await import("next/server");
    after(async () => { await sincronizzaGoogle({ forza: true }).catch(() => undefined); });
  } catch { /* ci pensa il controllo periodico */ }
}

/** Scollega: P&C ONE smette di leggere e scrivere; gli impegni letti da Google spariscono da P&C ONE. Su Google non si cancella nulla. */
export async function scollegaGoogle() {
  await prisma.configurazione.deleteMany({ where: { chiave: { in: [CHIAVI_GOOGLE.refresh, CHIAVI_GOOGLE.email, CHIAVI_GOOGLE.stato, CHIAVI_GOOGLE.ultima] } } });
  await prisma.eventoNextcloud.deleteMany({ where: { calendario: { startsWith: "google:" } } });
  accesso = null;
}
