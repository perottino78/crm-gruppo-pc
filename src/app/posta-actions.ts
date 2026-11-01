"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cifra, casellaPersonale, casellaAziendale, portaValida, HOST_PREDEFINITO, PORTA_PREDEFINITA } from "@/lib/mail/caselle";
import { postaAziendale, provaCasella, CHIAVI_POSTA } from "@/lib/mail/invio";

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
  const c = casellaPersonale(agg, await postaAziendale());
  if (!c) vai(ritorno, { postaErrore: "Password non leggibile: inseriscila di nuovo." });
  const esito = await provaCasella(c!, u.email);
  await prisma.utente.update({ where: { id: utenteId }, data: esito.inviata ? { smtpVerificataIl: new Date(), smtpErrore: null } : { smtpVerificataIl: null, smtpErrore: esito.motivo ?? "errore" } });
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
  // si prova prima di salvare: una casella aziendale sbagliata fermerebbe tutte le email del CRM
  const esito = await provaCasella(c!, u.email);
  if (!esito.inviata) vai(dove, { postaErrore: `Non salvata, la casella non funziona: ${esito.motivo}.` });
  for (const [chiave, valore] of Object.entries(valori)) await prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });
  revalidatePath(dove);
  vai(dove, { posta: `Posta aziendale collegata: email di prova inviata a ${u.email}.` });
}
