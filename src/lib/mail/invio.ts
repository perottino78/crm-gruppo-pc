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

export const APP_URL = process.env.APP_URL || "https://crm-gruppo-pc.vercel.app";

export const CHIAVI_POSTA = ["posta_host", "posta_porta", "posta_utente", "posta_password", "posta_mittente"] as const;

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
  const k = createHash("sha256").update(`${c.host}|${c.porta}|${c.utente}|${c.password}`).digest("hex");
  let t = trasporti.get(k);
  if (!t) {
    t = nodemailer.createTransport({ host: c.host, port: c.porta, secure: c.porta === 465, auth: { user: c.utente, pass: c.password }, connectionTimeout: 15000, greetingTimeout: 15000 });
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
};

async function spedisci(c: Casella, m: MailDaInviare, a: string[], da: string, rispondiA?: string | null) {
  await trasporto(c).sendMail({
    from: da,
    to: a.join(", "),
    replyTo: rispondiA || undefined,
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
      const u = await prisma.utente.findUnique({ where: { id: m.daUtenteId }, select: { nome: true, email: true, smtpUtente: true, smtpPassword: true, smtpHost: true, smtpPorta: true } });
      const personale = u && casellaPersonale(u, aziendale);
      if (personale) {
        try {
          await spedisci(personale, m, a, personale.mittente, m.rispondiA);
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

/** Prova una casella: si collega al server e manda un'email di prova a `a`. */
export async function provaCasella(c: Casella, a: string): Promise<EsitoMail> {
  try {
    await trasporto(c).verify();
    await trasporto(c).sendMail({
      from: c.mittente, to: a, subject: "Prova email dal CRM Gruppo P&C",
      text: `Ciao,\n\nquesta è un'email di prova: la casella ${c.utente} è collegata correttamente al CRM.\n\nCRM Gruppo P&C\n${APP_URL}`,
    });
    return { inviata: true, da: c.utente };
  } catch (e) {
    return { inviata: false, motivo: spiegaErrore((e as Error).message) };
  }
}
