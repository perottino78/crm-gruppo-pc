// Invio email reale via SMTP (Gmail/Google Workspace, Aruba, Register, Office365…).
// Si attiva da solo quando su Vercel ci sono le variabili SMTP_HOST, SMTP_USER, SMTP_PASS (e facoltative SMTP_PORT, MAIL_FROM).
// Senza variabili il CRM continua come prima: prepara la bozza e l'ufficio la invia a mano.
import nodemailer from "nodemailer";

export const APP_URL = process.env.APP_URL || "https://crm-gruppo-pc.vercel.app";

/** Indirizzo nudo del mittente ("Gruppo P&C <info@x.it>" → "info@x.it") */
export function indirizzoMittente(): string | null {
  const f = process.env.MAIL_FROM || process.env.SMTP_USER || "";
  return f.match(/<([^>]+)>/)?.[1] ?? (f.includes("@") ? f.trim() : null);
}

export function mailConfigurata(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let trasporto: nodemailer.Transporter | null = null;
function smtp() {
  if (!trasporto) {
    const port = Number(process.env.SMTP_PORT || 465);
    trasporto = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return trasporto;
}

export type EsitoMail = { inviata: boolean; motivo?: string };

/** Invia una email. Non lancia mai errori: un problema di posta non deve bloccare il lavoro nel CRM. */
export async function inviaMail(m: { a: string[]; oggetto: string; testo: string; rispondiA?: string | null; invito?: { metodo: "REQUEST" | "CANCEL"; ics: string } }): Promise<EsitoMail> {
  const a = [...new Set(m.a.map((x) => x.trim()).filter((x) => /.+@.+\..+/.test(x)))];
  if (!a.length) return { inviata: false, motivo: "nessun indirizzo email valido" };
  if (!mailConfigurata()) return { inviata: false, motivo: "invio automatico non configurato" };
  try {
    await smtp().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: a.join(", "),
      replyTo: m.rispondiA || undefined,
      subject: m.oggetto,
      text: m.testo,
      // Invito calendario: i programmi di posta (Gmail, Outlook, iPhone) lo mostrano con "Aggiungi al calendario"
      ...(m.invito ? { icalEvent: { method: m.invito.metodo, filename: "invito.ics", content: m.invito.ics } } : {}),
    });
    return { inviata: true };
  } catch (e) {
    return { inviata: false, motivo: `errore SMTP: ${(e as Error).message}`.slice(0, 200) };
  }
}
