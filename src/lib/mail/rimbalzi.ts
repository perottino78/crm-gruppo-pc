// Email rimbalzate: riconosce i messaggi "mancato recapito" (Mail Delivery System, MAILER-DAEMON, Undelivered Mail…)
// che arrivano nella casella aziendale e capisce a chi non è arrivata l'email e perché.
// Ogni email del CRM parte con l'intestazione X-CRM-Invio (es. c-<id invio campagna>, l-<id email lead>): quasi tutti i
// server la rimandano indietro nel rimbalzo, così si sa con precisione quale invio è fallito.
// Funzioni pure, testate in tests/mail/rimbalzi.test.ts.

export type Rimbalzo = {
  destinatari: string[];
  /** X-CRM-Invio dell'email originale, se il rimbalzo la riporta */
  codice: string | null;
  /** true = indirizzo da non usare più (inesistente, dominio sbagliato); false = problema temporaneo (casella piena…) */
  permanente: boolean;
  motivo: string;
};

export const INTESTAZIONE = "X-CRM-Invio";

const decodificaQP = (s: string) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_t, h) => String.fromCharCode(parseInt(h, 16)));

/** È un messaggio di mancato recapito? (mittente di sistema, rapporto di consegna o oggetto tipico) */
export function eRimbalzo(raw: string): boolean {
  const testa = raw.slice(0, Math.max(0, raw.search(/\r?\n\r?\n/)) || 4000);
  if (/^Content-Type:\s*multipart\/report;[\s\S]{0,200}report-type="?delivery-status/im.test(raw.slice(0, 20000))) return true;
  if (/^(From|Return-Path):[^\n]*(mailer-daemon|postmaster|mail delivery)/im.test(testa)) return true;
  return /^Subject:[^\n]*(undeliver|delivery status notification \(failure\)|failure notice|mail delivery failed|returned mail|non recapitabil|mancata consegna|impossibile recapitare|recapito non riuscito|delivery has failed)/im.test(testa);
}

const indirizzi = (s: string) => [...s.matchAll(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0].toLowerCase());

/** Legge il rimbalzo: destinatari falliti, codice dell'invio, permanente o temporaneo, motivo leggibile. Null se non è un rimbalzo. */
export function leggiRimbalzo(raw: string, opz: { ignora?: string[] } = {}): Rimbalzo | null {
  if (!eRimbalzo(raw)) return null;
  const testo = decodificaQP(raw);
  const ignora = new Set((opz.ignora ?? []).map((x) => x.toLowerCase()));
  // 1. rapporto standard (RFC 3464): Final-Recipient / Original-Recipient + Status
  let dest = [...testo.matchAll(/^(?:Final|Original)-Recipient:\s*rfc822;\s*<?([^\s>]+@[^\s>]+)>?/gim)].map((m) => m[1].toLowerCase());
  // 2. rimbalzi "a parole": l'indirizzo citato vicino alle frasi tipiche
  if (!dest.length) {
    const frasi = [...testo.matchAll(/(?:could not be delivered to|delivery to the following recipients? failed|failed recipients?|following address(?:es)? failed|non è stato possibile recapitare[^\n]*a|undeliverable to|recipient address rejected|user unknown|550[^\n]*)[\s\S]{0,300}/gi)].map((m) => m[0]);
    dest = frasi.flatMap(indirizzi);
  }
  dest = [...new Set(dest)].filter((d) => !ignora.has(d) && !/mailer-daemon|postmaster/.test(d));
  const codice = /^X-CRM-Invio:\s*([cl]-[A-Za-z0-9_-]+)/im.exec(testo)?.[1] ?? null;
  const status = /^Status:\s*([245])\.(\d{1,3})\.(\d{1,3})/im.exec(testo);
  const diag = /^Diagnostic-Code:\s*(?:smtp;\s*)?(.+(?:\r?\n[ \t].+)*)/im.exec(testo)?.[1]?.replace(/\s+/g, " ").trim();
  const codSmtp = /\b([45])\d\d\b[ -]?(?:[45]\.\d\.\d)?/.exec(diag ?? testo.slice(0, 20000))?.[1];
  const temporaneoTesto = /mailbox (is )?full|over ?quota|quota exceeded|casella piena|spazio esaurito|temporar|try again later|greylist/i.test(testo);
  const permanente = status ? status[1] === "5" && !temporaneoTesto : codSmtp ? codSmtp === "5" && !temporaneoTesto : !temporaneoTesto;
  if (!dest.length && !codice) return null;
  return { destinatari: dest, codice, permanente, motivo: spiegaRimbalzo(testo, diag) };
}

/** Il motivo in parole semplici. */
export function spiegaRimbalzo(testo: string, diag?: string | null): string {
  const t = `${diag ?? ""} ${testo.slice(0, 30000)}`;
  if (/user unknown|no such user|does not exist|unknown user|mailbox unavailable|address rejected|invalid recipient|recipient not found|account.*(disabled|inactive)|non esiste|utente sconosciuto|5\.1\.1/i.test(t)) return "indirizzo inesistente";
  if (/host not found|domain not found|no mx|nxdomain|name or service not known|5\.1\.2|4\.4\.4|dominio inesistente/i.test(t)) return "dominio sbagliato o inesistente";
  if (/mailbox (is )?full|over ?quota|quota exceeded|casella piena|5\.2\.2|4\.2\.2/i.test(t)) return "casella del cliente piena";
  if (/spam|blocked|blacklist|block ?list|rejected for policy|5\.7\.1|refused/i.test(t)) return "rifiutata dal server del cliente (filtro antispam)";
  return diag ? `non recapitata: ${diag.slice(0, 160)}` : "non recapitata";
}
