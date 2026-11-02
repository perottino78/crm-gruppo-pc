// Invio email reale via SMTP.
// Casella aziendale: si imposta dal CRM (Impostazioni › Email automatiche › Posta aziendale) oppure con le variabili
// di Vercel SMTP_HOST, SMTP_USER, SMTP_PASS (facoltative SMTP_PORT, MAIL_FROM). Quella salvata nel CRM ha la precedenza.
// Caselle personali: ogni utente nel suo Profilo inserisce la password della sua email; le email ai clienti mandate
// a suo nome partono dalla sua casella. Se la sua casella non va, l'email parte da quella aziendale con "rispondi a" lui.
// Senza nessuna casella il CRM continua come prima: prepara la bozza e l'ufficio la invia a mano.
import nodemailer from "nodemailer";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { casellaAziendale, casellaPersonale, indirizzoDi, spiegaErrore, type Casella } from "./caselle";
import { capisciErrore, alternative, chiaveTentativo, consiglio, usaSsl } from "./diagnosi";

export const APP_URL = process.env.APP_URL || "https://crm-gruppo-pc.vercel.app";

export const CHIAVI_POSTA = ["posta_host", "posta_porta", "posta_utente", "posta_password", "posta_mittente", "posta_sicura", "posta_tls_libero"] as const;

/** La casella aziendale in uso (dal CRM o da Vercel), o null se non c'è. */
export async function postaAziendale(): Promise<Casella | null> {
  const righe = await prisma.configurazione.findMany({ where: { chiave: { in: [...CHIAVI_POSTA] } } });
  return casellaAziendale(Object.fromEntries(righe.map((r) => [r.chiave, r.valore])), process.env);
}

/** Indirizzo nudo del mittente aziendale ("Gruppo P&C <info@x.it>" → "info@x.it") */
export async function indirizzoMittente(): Promise<string | null> {
  return indirizzoDi((await postaAziendale())?.mittente);
}

export async function mailConfigurata(): Promise<boolean> {
  return !!(await postaAziendale());
}

const trasporti = new Map<string, nodemailer.Transporter>();
function trasporto(c: Casella) {
  const k = createHash("sha256").update(`${c.host}|${c.porta}|${usaSsl(c)}|${!!c.accettaCertificato}|${c.utente}|${c.password}`).digest("hex");
  let t = trasporti.get(k);
  if (!t) {
    const ssl = usaSsl(c);
    t = nodemailer.createTransport({
      host: c.host, port: c.porta, secure: ssl, auth: { user: c.utente, pass: c.password },
      connectionTimeout: 15000, greetingTimeout: 15000,
      // il certificato non riconosciuto si accetta solo se l'amministratore l'ha scelto: la posta resta comunque cifrata
      ...(c.accettaCertificato ? { tls: { rejectUnauthorized: false } } : {}),
    });
    trasporti.set(k, t);
  }
  return t;
}

export type EsitoMail = { inviata: boolean; motivo?: string; da?: string };
export type MailDaInviare = {
  a: string[]; oggetto: string; testo: string; html?: string; da?: string; rispondiA?: string | null;
  invito?: { metodo: "REQUEST" | "CANCEL"; ics: string };
  /** Manda dalla casella personale di questo utente (se l'ha collegata nel Profilo). */
  daUtenteId?: string | null;
  /** Intestazioni in più (es. X-CRM-Invio: serve a riconoscere a quale invio si riferisce un'email rimbalzata). */
  intestazioni?: Record<string, string>;
  /** In copia (es. il commerciale o un collega) */
  cc?: string[];
  /** File allegati (es. l'offerta in PDF, foto, schede tecniche) */
  allegati?: { nome: string; contenuto: Buffer; mime?: string }[];
};

async function spedisci(c: Casella, m: MailDaInviare, a: string[], da: string, rispondiA?: string | null) {
  const cc = (m.cc ?? []).filter((x) => /.+@.+\..+/.test(x) && !a.includes(x));
  await trasporto(c).sendMail({
    from: da,
    to: a.join(", "),
    ...(cc.length ? { cc: cc.join(", ") } : {}),
    // i "mancato recapito" tornano alla casella che spedisce, dove il CRM li legge (vedi rimbalzi-server.ts)
    envelope: { from: c.utente, to: [...a, ...cc] },
    ...(m.allegati?.length ? { attachments: m.allegati.map((f) => ({ filename: f.nome, content: f.contenuto, ...(f.mime ? { contentType: f.mime } : {}) })) } : {}),
    replyTo: rispondiA || undefined,
    ...(m.intestazioni ? { headers: m.intestazioni } : {}),
    subject: m.oggetto,
    text: m.testo,
    ...(m.html ? { html: m.html } : {}),
    // Invito calendario: i programmi di posta (Gmail, Outlook, iPhone) lo mostrano con "Aggiungi al calendario"
    ...(m.invito ? { icalEvent: { method: m.invito.metodo, filename: "invito.ics", content: m.invito.ics } } : {}),
  });
}

/** Invia una email. Non lancia mai errori: un problema di posta non deve bloccare il lavoro nel CRM. */
export async function inviaMail(m: MailDaInviare): Promise<EsitoMail> {
  const a = [...new Set(m.a.map((x) => x.trim()).filter((x) => /.+@.+\..+/.test(x)))];
  if (!a.length) return { inviata: false, motivo: "nessun indirizzo email valido" };
  try {
    const aziendale = await postaAziendale();
    // 1. dalla casella personale di chi manda
    let rispondiA = m.rispondiA;
    if (m.daUtenteId) {
      const u = await prisma.utente.findUnique({ where: { id: m.daUtenteId }, select: { nome: true, email: true, smtpUtente: true, smtpPassword: true, smtpHost: true, smtpPorta: true, smtpErrore: true } });
      const personale = u && casellaPersonale(u, aziendale);
      if (personale) {
        try {
          await spedisci(personale, m, a, personale.mittente, m.rispondiA);
          if (u.smtpErrore) await prisma.utente.update({ where: { id: m.daUtenteId }, data: { smtpErrore: null, smtpVerificataIl: new Date() } }).catch(() => {});
          return { inviata: true, da: personale.utente };
        } catch (e) {
          // la sua casella non va (password cambiata?): lo segniamo nel profilo e si passa a quella aziendale
          await prisma.utente.update({ where: { id: m.daUtenteId }, data: { smtpErrore: spiegaErrore((e as Error).message) } }).catch(() => {});
        }
      }
      if (u?.email) rispondiA = rispondiA || u.email; // le risposte del cliente arrivano comunque a lui
    }
    // 2. dalla casella aziendale
    if (!aziendale) return { inviata: false, motivo: "invio automatico non configurato" };
    await spedisci(aziendale, m, a, m.da || aziendale.mittente, rispondiA);
    return { inviata: true, da: indirizzoDi(m.da || aziendale.mittente) ?? aziendale.utente };
  } catch (e) {
    return { inviata: false, motivo: `errore SMTP: ${spiegaErrore((e as Error).message)}`.slice(0, 200) };
  }
}

/** Prova una casella così com'è: si collega al server e manda un'email di prova a `a`. */
export async function provaCasella(c: Casella, a: string): Promise<EsitoMail> {
  const e = await provaCasellaGrezza(c, a);
  return e.errore ? { inviata: false, motivo: spiegaErrore(e.errore) } : { inviata: true, da: c.utente };
}

export type EsitoRicerca = EsitoMail & { casella?: Casella; prove: string[] };

/**
 * Prova la casella e, se la connessione non va, prova da sola le correzioni più comuni (nome del server dal certificato,
 * l'altra cifratura o l'altra porta, certificato accettato se permesso). Ritorna le impostazioni che funzionano.
 */
export async function cercaImpostazioni(c: Casella, a: string, opz: { accettaCertificato?: boolean; maxProve?: number } = {}): Promise<EsitoRicerca> {
  const provate = new Set<string>();
  const coda: Casella[] = [c];
  const prove: string[] = [];
  let ultimo = "";
  while (coda.length && provate.size < (opz.maxProve ?? 6)) {
    const x = coda.shift()!;
    if (provate.has(chiaveTentativo(x))) continue;
    provate.add(chiaveTentativo(x));
    const descr = `${x.host}:${x.porta} ${usaSsl(x) ? "SSL" : "STARTTLS"}${x.accettaCertificato ? " (certificato accettato)" : ""}`;
    const e = await provaCasellaGrezza(x, a);
    if (!e.errore) { prove.push(`${descr}: OK`); return { inviata: true, da: x.utente, casella: x, prove }; }
    ultimo = e.errore;
    prove.push(`${descr}: ${e.errore.slice(0, 160)}`);
    const p = capisciErrore(e.errore);
    // password sbagliata: inutile insistere; server irraggiungibile: ci si ferma solo se è il server indicato dall'utente
    if (p.tipo === "PASSWORD" || (p.tipo === "RETE" && prove.length === 1)) return { inviata: false, motivo: `${consiglio(p, !!opz.accettaCertificato)} (dettaglio: ${e.errore.slice(0, 160)})`, prove };
    if (p.tipo === "RETE") continue; // una porta alternativa chiusa: si passa alla prossima prova
    coda.push(...alternative(x, p, provate, !!opz.accettaCertificato));
  }
  // il messaggio parte dal problema più utile visto nelle prove (non dall'ultima porta chiusa)
  const visti = prove.map((x) => capisciErrore(x));
  const p = visti.find((x) => x.tipo === "CERTIFICATO" || x.tipo === "NOME_CERTIFICATO") ?? visti.find((x) => x.tipo === "MODO") ?? capisciErrore(ultimo);
  return { inviata: false, motivo: `${consiglio(p, !!opz.accettaCertificato)} (dettaglio: ${ultimo.slice(0, 160)})`, prove };
}

async function provaCasellaGrezza(c: Casella, a: string): Promise<{ errore?: string }> {
  try {
    await trasporto(c).verify();
    await trasporto(c).sendMail({
      from: c.mittente, to: a, subject: "Prova email dal CRM Gruppo P&C",
      text: `Ciao,\n\nquesta è un'email di prova: la casella ${c.utente} è collegata correttamente al CRM.\n\nCRM Gruppo P&C\n${APP_URL}`,
    });
    return {};
  } catch (e) {
    const msg = (e as Error).message || String(e);
    // nomi a cui è intestato il certificato del server (servono per riprovare con il nome giusto)
    const san = (e as { cert?: { subjectaltname?: string } }).cert?.subjectaltname;
    return { errore: san && !msg.includes("DNS:") ? `${msg} [certificato: ${san}]` : msg };
  }
}
