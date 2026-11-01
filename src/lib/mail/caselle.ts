// Caselle di posta: quella aziendale (impostabile dal CRM o da Vercel) e quelle personali di ogni utente.
// Funzioni pure: cifratura della password e scelta dei parametri del server. Testate senza database.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export type Casella = { host: string; porta: number; utente: string; password: string; mittente: string };

/** Server della posta aziendale (hosting proprio, nome.cognome@gruppopec.com). */
export const HOST_PREDEFINITO = "mail.gruppopec.com";
export const PORTA_PREDEFINITA = 465;

const chiave = () => createHash("sha256").update(`posta:${process.env.MAIL_SECRET || process.env.SESSION_SECRET || "gpc-2026-session-secret-x7f2-cambiami-in-produzione"}`).digest();

/** Cifra la password della casella (AES-256-GCM). Nel database non finisce mai in chiaro. */
export function cifra(testo: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chiave(), iv);
  const dati = Buffer.concat([c.update(testo, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${dati.toString("base64")}`;
}

/** Decifra; null se il valore è rovinato o la chiave è cambiata (in quel caso va reinserita la password). */
export function decifra(valore?: string | null): string | null {
  const p = valore?.split(":");
  if (!p || p.length !== 4 || p[0] !== "v1") return null;
  try {
    const d = createDecipheriv("aes-256-gcm", chiave(), Buffer.from(p[1], "base64"));
    d.setAuthTag(Buffer.from(p[2], "base64"));
    return Buffer.concat([d.update(Buffer.from(p[3], "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const portaValida = (n: unknown) => (Number.isInteger(Number(n)) && Number(n) > 0 && Number(n) < 65536 ? Number(n) : null);

/** Parametri della casella aziendale: prima quelli salvati nel CRM (Impostazioni), altrimenti le variabili di Vercel. */
export function casellaAziendale(conf: Record<string, string | undefined>, env: Record<string, string | undefined>): Casella | null {
  const pass = decifra(conf.posta_password);
  if (conf.posta_utente && pass) {
    return { host: conf.posta_host || HOST_PREDEFINITO, porta: portaValida(conf.posta_porta) ?? PORTA_PREDEFINITA, utente: conf.posta_utente, password: pass, mittente: conf.posta_mittente || conf.posta_utente };
  }
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    return { host: env.SMTP_HOST, porta: portaValida(env.SMTP_PORT) ?? PORTA_PREDEFINITA, utente: env.SMTP_USER, password: env.SMTP_PASS, mittente: env.MAIL_FROM || env.SMTP_USER };
  }
  return null;
}

/** Casella personale di un utente: basta la password, il resto si prende dalla posta aziendale. */
export function casellaPersonale(
  u: { nome: string; email: string; smtpUtente: string | null; smtpPassword: string | null; smtpHost: string | null; smtpPorta: number | null },
  aziendale: Casella | null,
): Casella | null {
  const pass = decifra(u.smtpPassword);
  if (!pass) return null;
  const utente = u.smtpUtente?.trim() || u.email;
  return {
    host: u.smtpHost?.trim() || aziendale?.host || HOST_PREDEFINITO,
    porta: u.smtpPorta ?? aziendale?.porta ?? PORTA_PREDEFINITA,
    utente,
    password: pass,
    mittente: `${u.nome.replace(/[<>"]/g, "")} <${utente}>`,
  };
}

/** "Mario Rossi <mario@x.it>" → "mario@x.it" */
export const indirizzoDi = (f?: string | null) => (f ?? "").match(/<([^>]+)>/)?.[1] ?? ((f ?? "").includes("@") ? (f ?? "").trim() : null);

/** Errore SMTP in parole semplici, per chi non è tecnico. */
export function spiegaErrore(msg: string): string {
  const m = msg.toLowerCase();
  if (/auth|535|534|credentials|password|login/.test(m)) return "email o password della casella non corrette";
  if (/enotfound|getaddrinfo/.test(m)) return "server di posta non trovato (controlla il nome del server)";
  if (/timeout|timed out|econnrefused|econnreset/.test(m)) return "il server di posta non risponde (controlla server e porta)";
  if (/certificate|self signed|tls|ssl/.test(m)) return "problema di connessione sicura (prova la porta 465 o 587)";
  if (/sender|from|553|550/.test(m)) return "il server non permette di spedire con questo mittente";
  return msg.slice(0, 160);
}
