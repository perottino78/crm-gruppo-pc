"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cifra, casellaPersonale, casellaAziendale, portaValida, HOST_PREDEFINITO, PORTA_PREDEFINITA } from "@/lib/mail/caselle";
import { postaAziendale, cercaImpostazioni, CHIAVI_POSTA } from "@/lib/mail/invio";
import { usaSsl } from "@/lib/mail/diagnosi";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const emailOk = (e: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const vai = (dove: string, p: Record<string, string>) => redirect(`${dove}${dove.includes("?") ? "&" : "?"}${new URLSearchParams(p)}#posta`);

/** Salva la casella di un utente (password cifrata) e la prova subito con un'email a lui stesso. */
async function collega(utenteId: string, fd: FormData, ritorno: string) {
  const u = await prisma.utente.findUniqueOrThrow({ where: { id: utenteId } });
  const password = str(fd, "password");
  const smtpUtente = str(fd, "smtpUtente") ?? u.email;
  if (!emailOk(smtpUtente)) vai(ritorno, { postaErrore: "Scrivi un indirizzo email valido." });
  if (!password && !u.smtpPassword) vai(ritorno, { postaErrore: "Scrivi la password della casella email." });
  const dati = {
    smtpUtente: smtpUtente === u.email ? null : smtpUtente,
    smtpHost: str(fd, "smtpHost"),
    smtpPorta: portaValida(str(fd, "smtpPorta")),
    ...(password ? { smtpPassword: cifra(password) } : {}),
  };
  const agg = await prisma.utente.update({ where: { id: utenteId }, data: dati });
  const aziendale = await postaAziendale();
  const c = casellaPersonale(agg, aziendale);
  if (!c) vai(ritorno, { postaErrore: "Password non leggibile: inseriscila di nuovo." });
  // prova e, se serve, corregge da sola server/porta (stesse regole della posta aziendale)
  const esito = await cercaImpostazioni(c!, u.email, { accettaCertificato: !!aziendale?.accettaCertificato });
  const ok = esito.inviata && esito.casella;
  await prisma.utente.update({
    where: { id: utenteId },
    data: ok
      ? { smtpVerificataIl: new Date(), smtpErrore: null,
          ...(esito.casella!.host !== c!.host ? { smtpHost: esito.casella!.host } : {}),
          ...(esito.casella!.porta !== c!.porta ? { smtpPorta: esito.casella!.porta } : {}) }
      : { smtpVerificataIl: null, smtpErrore: (esito.motivo ?? "errore").slice(0, 300) },
  });
  revalidatePath("/profilo");
  revalidatePath("/impostazioni");
  vai(ritorno, esito.inviata ? { posta: `Casella collegata: email di prova inviata a ${u.email}.` } : { postaErrore: `La casella non funziona: ${esito.motivo}.` });
}

export async function collegaMiaCasella(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  await collega(u.id, fd, "/profilo");
}

export async function scollegaMiaCasella() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  await prisma.utente.update({ where: { id: u.id }, data: { smtpPassword: null, smtpUtente: null, smtpHost: null, smtpPorta: null, smtpVerificataIl: null, smtpErrore: null } });
  revalidatePath("/profilo");
  vai("/profilo", { posta: "Casella scollegata: le tue email partiranno dalla casella aziendale." });
}

/** L'amministratore collega la casella di un collega (per chi preferisce non farlo da solo). */
export async function adminCollegaCasella(fd: FormData) {
  const u = await getCurrentUser();
  if (!u || u.ruolo !== "AMMINISTRATORE") redirect("/impostazioni");
  const id = str(fd, "utenteId");
  if (!id) return;
  await collega(id, fd, `/impostazioni?utente=${id}`);
}

/** Posta aziendale: server, casella principale e password, impostabili dal CRM senza passare da Vercel. */
export async function salvaPostaAziendale(fd: FormData) {
  const u = await getCurrentUser();
  if (!u || u.ruolo !== "AMMINISTRATORE") redirect("/impostazioni/automazioni");
  const dove = "/impostazioni/automazioni";
  const utente = str(fd, "utente");
  if (!emailOk(utente)) vai(dove, { postaErrore: "Scrivi l'indirizzo della casella aziendale." });
  const attuale = Object.fromEntries((await prisma.configurazione.findMany({ where: { chiave: { in: [...CHIAVI_POSTA] } } })).map((r) => [r.chiave, r.valore]));
  const password = str(fd, "password");
  if (!password && !attuale.posta_password) vai(dove, { postaErrore: "Scrivi la password della casella aziendale." });
  const valori: Record<string, string> = {
    posta_host: str(fd, "host") ?? HOST_PREDEFINITO,
    posta_porta: String(portaValida(str(fd, "porta")) ?? PORTA_PREDEFINITA),
    posta_utente: utente!,
    posta_mittente: str(fd, "mittente") ?? `Gruppo P&C <${utente}>`,
    posta_password: password ? cifra(password) : attuale.posta_password,
  };
  const c = casellaAziendale(valori, {});
  if (!c) vai(dove, { postaErrore: "Password non leggibile: inseriscila di nuovo." });
  // si prova prima di salvare: una casella aziendale sbagliata fermerebbe tutte le email del CRM.
  // Se la connessione sicura non va, il CRM prova da solo nome del server dal certificato, l'altra cifratura e l'altra porta.
  const accetta = fd.get("accettaCertificato") === "on";
  const esito = await cercaImpostazioni(c!, u.email, { accettaCertificato: accetta });
  // non salvata: si ripropongono i dati scritti (tranne la password) e l'elenco delle prove fatte
  if (!esito.inviata || !esito.casella) vai(dove, { postaErrore: `Non salvata, la casella non funziona: ${esito.motivo}.`, prove: esito.prove.join("\n"), u: utente!, h: valori.posta_host, pt: valori.posta_porta, m: valori.posta_mittente, ...(accetta ? { ac: "1" } : {}) });
  const t = esito.casella!;
  Object.assign(valori, { posta_host: t.host, posta_porta: String(t.porta), posta_sicura: usaSsl(t) ? "1" : "0", posta_tls_libero: t.accettaCertificato ? "1" : "0" });
  const corretto = t.host !== c!.host || t.porta !== c!.porta || usaSsl(t) !== usaSsl(c!) || !!t.accettaCertificato;
  for (const [chiave, valore] of Object.entries(valori)) await prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });
  revalidatePath(dove);
  vai(dove, { posta: `Posta aziendale collegata: email di prova inviata a ${u.email}.${corretto ? ` Impostazioni corrette in automatico: server ${t.host}, porta ${t.porta} ${usaSsl(t) ? "SSL" : "STARTTLS"}${t.accettaCertificato ? ", certificato del server accettato" : ""}.` : ""}` });
}

/** Servizio di invio (Brevo) per campagne ed email automatiche: salva login e chiave SMTP e manda subito una prova a chi salva. */
export async function salvaServizioInvio(fd: FormData) {
  const u = await getCurrentUser();
  if (!u || u.ruolo !== "AMMINISTRATORE") redirect("/impostazioni/automazioni");
  const dove = "/impostazioni/automazioni";
  const go = (p: Record<string, string>) => redirect(`${dove}?${new URLSearchParams(p)}#servizio`);
  const { salvaServizio, servizioInvio, scollegaServizio } = await import("@/lib/mail/servizio");
  const { inviaMail } = await import("@/lib/mail/invio");
  const { CONTATTI } = await import("@/lib/automazioni/email");
  const utente = str(fd, "utente");
  const chiave = str(fd, "chiave");
  if (!utente) go({ servizioErrore: "Scrivi il login SMTP di Brevo (es. 9a1b2c001@smtp-brevo.com)." });
  const prima = await servizioInvio();
  if (!chiave && !prima) go({ servizioErrore: "Incolla la chiave SMTP di Brevo." });
  await salvaServizio(utente!, chiave, str(fd, "host"), portaValida(str(fd, "porta")));
  const esito = await inviaMail({ a: [u.email], oggetto: "Prova del servizio di invio (Brevo) da P&C ONE", testo: `Ciao,\n\nquesta email è partita da Brevo: campagne ed email automatiche ai clienti useranno questo servizio.\n\nP&C ONE`, da: CONTATTI.mittenteClienti, servizio: true });
  if (!esito.inviata) {
    if (!prima) await scollegaServizio(); // non va: si torna come prima, le email non devono fermarsi
    go({ servizioErrore: `Non collegato, Brevo non ha accettato la prova: ${esito.motivo ?? "errore"}. Controlla login e chiave SMTP e che il mittente (${CONTATTI.mittenteClienti}) sia verificato in Brevo.` });
  }
  revalidatePath(dove);
  go({ servizio: `Brevo collegato: email di prova inviata a ${u.email}. Da adesso campagne ed email automatiche ai clienti partono da Brevo.` });
}

export async function scollegaServizioInvio() {
  const u = await getCurrentUser();
  if (!u || u.ruolo !== "AMMINISTRATORE") redirect("/impostazioni/automazioni");
  const { scollegaServizio } = await import("@/lib/mail/servizio");
  await scollegaServizio();
  revalidatePath("/impostazioni/automazioni");
  redirect("/impostazioni/automazioni?servizio=" + encodeURIComponent("Brevo scollegato: le email tornano a partire dalla posta aziendale.") + "#servizio");
}

/**
 * Crea in Brevo il webhook dei rimbalzi e delle disiscrizioni (POST /v3/webhooks) con una chiave API incollata per l'occasione:
 * la chiave NON viene salvata (serve una volta sola). Se il webhook c'è già, lo dice e non lo duplica.
 */
export async function creaWebhookBrevo(fd: FormData) {
  const u = await getCurrentUser();
  if (!u || u.ruolo !== "AMMINISTRATORE") redirect("/impostazioni/automazioni");
  const go = (p: Record<string, string>) => redirect(`/impostazioni/automazioni?${new URLSearchParams(p)}#servizio`);
  const chiave = str(fd, "apiKey");
  if (!chiave || !chiave.startsWith("xkeysib-")) go({ servizioErrore: "Incolla una chiave API di Brevo (inizia con «xkeysib-»): Brevo › Impostazioni › SMTP e API › scheda «Chiavi API e MCP» › «Genera una nuova chiave API»." });
  const { chiaveWebhook } = await import("@/lib/mail/servizio");
  const { APP_URL } = await import("@/lib/mail/invio");
  const url = `${APP_URL}/api/brevo/eventi?k=${await chiaveWebhook()}`;
  const API = process.env.BREVO_API_BASE || "https://api.brevo.com";
  const intestazioni = { "api-key": chiave!, accept: "application/json", "content-type": "application/json" };
  let messaggio: Record<string, string>;
  try {
    const elenco = await fetch(`${API}/v3/webhooks?type=transactional`, { headers: intestazioni, signal: AbortSignal.timeout(20_000) });
    if (elenco.status === 401) throw new Error("chiave API non valida");
    const gia = ((await elenco.json().catch(() => ({}))) as { webhooks?: { url?: string }[] }).webhooks?.some((w) => w.url === url);
    if (gia) messaggio = { servizio: "Il webhook di P&C ONE c'era già in Brevo: rimbalzi e disiscrizioni arrivano qui." };
    else {
      const r = await fetch(`${API}/v3/webhooks`, {
        method: "POST", headers: intestazioni, signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ url, type: "transactional", description: "P&C ONE: rimbalzi e disiscrizioni", events: ["hardBounce", "softBounce", "blocked", "invalid", "spam", "unsubscribed"] }),
      });
      if (!r.ok) throw new Error(`Brevo ha risposto ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
      messaggio = { servizio: "Webhook creato in Brevo: da adesso rimbalzi, disiscrizioni e segnalazioni di spam arrivano in P&C ONE. La chiave API non è stata salvata: puoi cancellarla in Brevo." };
    }
  } catch (e) {
    messaggio = { servizioErrore: `Webhook non creato: ${e instanceof Error ? e.message : String(e)}` };
  }
  go(messaggio!);
}
