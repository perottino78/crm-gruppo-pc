// Invio email degli ordini tramite un servizio di invio via API (Resend o Brevo), senza librerie.
// Configurazione su Vercel: EMAIL_PROVIDER=resend|brevo, EMAIL_API_KEY, EMAIL_MITTENTE (es. "Ufficio ordini P&C <ordini@gruppopec.com>").

export type Allegato = { nome: string; contenuto: Uint8Array; mime: string };
export type Messaggio = { a: string[]; cc?: string[]; rispondiA?: string; oggetto: string; testo: string; allegati?: Allegato[] };
export type ConfigEmail = { provider: "resend" | "brevo"; apiKey: string; mittente: string };

export function configEmail(env: Record<string, string | undefined> = process.env): ConfigEmail | null {
  const provider = (env.EMAIL_PROVIDER ?? "").toLowerCase();
  if ((provider !== "resend" && provider !== "brevo") || !env.EMAIL_API_KEY || !env.EMAIL_MITTENTE) return null;
  return { provider, apiKey: env.EMAIL_API_KEY, mittente: env.EMAIL_MITTENTE };
}

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const indirizzo = (s: string) => { const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/); return m ? { name: m[1].replace(/^"|"$/g, ""), email: m[2] } : { email: s.trim() }; };
export const emailValida = (s: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s.trim());

/** Prepara la richiesta HTTP per il servizio scelto (funzione pura, testata). */
export function richiestaInvio(cfg: ConfigEmail, m: Messaggio): { url: string; init: RequestInit } {
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${m.testo.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`;
  if (cfg.provider === "resend") {
    return {
      url: "https://api.resend.com/emails",
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: cfg.mittente, to: m.a, cc: m.cc?.length ? m.cc : undefined, reply_to: m.rispondiA, subject: m.oggetto, text: m.testo, html, attachments: m.allegati?.map((a) => ({ filename: a.nome, content: b64(a.contenuto) })) }),
      },
    };
  }
  return {
    url: "https://api.brevo.com/v3/smtp/email",
    init: {
      method: "POST",
      headers: { "api-key": cfg.apiKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: indirizzo(cfg.mittente), to: m.a.map((e) => ({ email: e })), cc: m.cc?.length ? m.cc.map((e) => ({ email: e })) : undefined, replyTo: m.rispondiA ? indirizzo(m.rispondiA) : undefined, subject: m.oggetto, textContent: m.testo, htmlContent: html, attachment: m.allegati?.map((a) => ({ name: a.nome, content: b64(a.contenuto) })) }),
    },
  };
}

export async function inviaEmail(cfg: ConfigEmail, m: Messaggio): Promise<{ ok: boolean; errore?: string }> {
  const { url, init } = richiestaInvio(cfg, m);
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
    if (r.ok) return { ok: true };
    const corpo = (await r.text()).slice(0, 300);
    return { ok: false, errore: `Il servizio di invio ha risposto ${r.status}: ${corpo}` };
  } catch (e) {
    return { ok: false, errore: `Invio non riuscito: ${(e as Error).message}` };
  }
}

/** Link mailto di riserva quando l'invio automatico non è configurato. */
export function linkMailto(m: Pick<Messaggio, "a" | "cc" | "oggetto" | "testo">): string {
  const q = new URLSearchParams();
  if (m.cc?.length) q.set("cc", m.cc.join(","));
  q.set("subject", m.oggetto); q.set("body", m.testo);
  return `mailto:${m.a.join(",")}?${q.toString().replace(/\+/g, "%20")}`;
}
