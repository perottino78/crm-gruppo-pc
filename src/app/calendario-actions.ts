"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { daOraRoma, perInput, giornoBreve, chiaveGiorno, oraRoma } from "@/lib/calendario/tempo";
import { inviaInvito } from "@/lib/calendario/server";
import { nomeTipoAppuntamento } from "@/lib/calendario/eventi";

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function ritorno(fd: FormData, def: string, msg?: string) {
  const r = str(fd, "ritorno") || def;
  if (!msg) return r;
  return r + (r.includes("?") ? "&" : "?") + "msg=" + encodeURIComponent(msg);
}

function esitoInvito(e: { inviati: string[]; motivo?: string }) {
  return e.inviati.length ? `Invito inviato a ${e.inviati.join(", ")}.` : `Salvato. Invito non inviato (${e.motivo}).`;
}

// L'appuntamento compare già nel diario del cliente; qui lo annotiamo anche nella pratica collegata
async function diario(_clienteId: string, commessaId: string | null, chi: string, testo: string) {
  if (commessaId) await prisma.commessaEvento.create({ data: { commessaId, utenteNome: chi, testo } }).catch(() => null);
}

export async function creaAppuntamento(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const clienteId = str(formData, "clienteId");
  const dataOra = daOraRoma(str(formData, "dataOra"));
  if (!clienteId || !dataOra) redirect(ritorno(formData, "/calendario", "Scegli cliente, giorno e ora."));
  const tipo = str(formData, "tipo") ?? "COMMERCIALE";
  const a = await prisma.appuntamento.create({
    data: {
      clienteId, dataOra, tipo,
      utenteId: str(formData, "utenteId") ?? u.id,
      durataMin: Math.max(15, Math.min(600, Number(str(formData, "durataMin") ?? 60) || 60)),
      titolo: str(formData, "titolo"), luogo: str(formData, "luogo"), note: str(formData, "note"),
      commessaId: str(formData, "commessaId"), preventivoId: str(formData, "preventivoId"),
      invitaCliente: formData.get("invitaCliente") === "on", creatoDaNome: u.nome,
    },
    include: { utente: true },
  });
  await diario(clienteId, a.commessaId, u.nome, `📅 ${nomeTipoAppuntamento(tipo)} fissato per ${giornoBreve(chiaveGiorno(dataOra))} ore ${oraRoma(dataOra)} con ${a.utente.nome}.`);
  const e = await inviaInvito(`APPUNTAMENTO:${a.id}`);
  revalidatePath("/calendario");
  revalidatePath(`/clienti/${clienteId}`);
  redirect(ritorno(formData, `/calendario?giorno=${chiaveGiorno(dataOra)}`, `Appuntamento salvato. ${esitoInvito(e)}`));
}

export async function modificaAppuntamento(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "id");
  if (!id) return;
  const prima = await prisma.appuntamento.findUnique({ where: { id } });
  if (!prima) return;
  const dataOra = daOraRoma(str(formData, "dataOra")) ?? prima.dataOra;
  const utenteId = str(formData, "utenteId") ?? prima.utenteId;
  const a = await prisma.appuntamento.update({
    where: { id },
    data: {
      dataOra, utenteId, tipo: str(formData, "tipo") ?? prima.tipo,
      durataMin: Math.max(15, Math.min(600, Number(str(formData, "durataMin") ?? prima.durataMin) || 60)),
      titolo: str(formData, "titolo"), luogo: str(formData, "luogo"), note: str(formData, "note"),
      invitaCliente: formData.get("invitaCliente") === "on",
      stato: prima.stato === "ANNULLATO" ? "PROGRAMMATO" : prima.stato,
    },
    include: { utente: true },
  });
  // se cambia l'incaricato, il vecchio riceve l'annullamento
  if (prima.utenteId !== utenteId) {
    const vecchio = await prisma.utente.findUnique({ where: { id: prima.utenteId } });
    if (vecchio?.email) await inviaInvito(`APPUNTAMENTO:${id}`, "CANCEL", { soloEmail: vecchio.email });
  }
  const spostato = prima.dataOra.getTime() !== dataOra.getTime();
  if (spostato) await diario(a.clienteId, a.commessaId, u.nome, `📅 Appuntamento spostato a ${giornoBreve(chiaveGiorno(dataOra))} ore ${oraRoma(dataOra)} (${a.utente.nome}).`);
  const e = await inviaInvito(`APPUNTAMENTO:${id}`);
  revalidatePath("/calendario");
  revalidatePath(`/clienti/${a.clienteId}`);
  redirect(ritorno(formData, `/calendario/appuntamento/${id}`, `Modifiche salvate. ${esitoInvito(e)}`));
}

export async function esitoAppuntamento(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "id");
  const stato = str(formData, "stato");
  if (!id || !stato || !["COMPLETATO", "ANNULLATO", "CONFERMATO", "PROGRAMMATO"].includes(stato)) return;
  const a = await prisma.appuntamento.update({ where: { id }, data: { stato, esito: str(formData, "esito") } });
  const testi: Record<string, string> = { COMPLETATO: "✅ Appuntamento svolto", ANNULLATO: "❌ Appuntamento annullato", CONFERMATO: "👍 Appuntamento confermato dal cliente", PROGRAMMATO: "Appuntamento riaperto" };
  await diario(a.clienteId, a.commessaId, u.nome, `${testi[stato]}${a.esito ? `: ${a.esito}` : ""}.`);
  let msg = "Salvato.";
  if (stato === "ANNULLATO") msg = esitoInvito(await inviaInvito(`APPUNTAMENTO:${id}`, "CANCEL")).replace("Invito", "Annullamento");
  revalidatePath("/calendario");
  revalidatePath(`/clienti/${a.clienteId}`);
  redirect(ritorno(formData, `/calendario/appuntamento/${id}`, msg));
}

export async function reinviaInvito(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const chiave = str(formData, "chiave");
  if (!chiave) return;
  const e = await inviaInvito(chiave);
  redirect(ritorno(formData, "/calendario", esitoInvito(e)));
}

/** Crea (o rigenera, se compromesso) il link privato del calendario personale */
export async function generaLinkCalendario(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  await prisma.utente.update({ where: { id: u.id }, data: { calendarioToken: randomBytes(24).toString("base64url") } });
  revalidatePath("/calendario/sul-telefono");
  redirect(ritorno(formData, "/calendario/sul-telefono"));
}

export async function spostaAppuntamentoRapido(formData: FormData) {
  // usato dai pulsanti "+1 giorno / +1 settimana" nella scheda appuntamento
  const id = str(formData, "id");
  const giorni = Number(str(formData, "giorni") ?? 0);
  if (!id || !giorni) return;
  const a = await prisma.appuntamento.findUnique({ where: { id } });
  if (!a) return;
  const fd = new FormData();
  fd.set("id", id);
  fd.set("dataOra", perInput(new Date(a.dataOra.getTime() + giorni * 86400_000)));
  fd.set("utenteId", a.utenteId);
  fd.set("tipo", a.tipo);
  fd.set("durataMin", String(a.durataMin));
  if (a.titolo) fd.set("titolo", a.titolo);
  if (a.luogo) fd.set("luogo", a.luogo);
  if (a.note) fd.set("note", a.note);
  if (a.invitaCliente) fd.set("invitaCliente", "on");
  return modificaAppuntamento(fd);
}

/** Testo dell'email con il link del calendario personale (per Google, iPhone, Outlook). */
function emailLinkCalendario(nome: string, https: string) {
  const webcal = https.replace(/^https:/, "webcal:");
  return [
    `Ciao ${nome.split(" ")[0]},`,
    "da oggi i tuoi appuntamenti, rilievi e pose del CRM possono comparire da soli nel calendario del tuo telefono.",
    `• Google Calendar (Android o computer): apri questo link dal computer, con il tuo account Google, e conferma «Aggiungi»:\n${`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`}\nPoi sul telefono, in Google Calendar › Impostazioni, attiva il calendario «CRM P&C».`,
    `• iPhone: tocca questo link dal telefono e conferma «Abbonati»:\n${webcal}`,
    `• Outlook: https://outlook.office.com/calendar/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent("CRM P&C")}`,
    "Il link è personale: non inoltrarlo. Google aggiorna il calendario ogni qualche ora; per le novità urgenti arriva comunque l'invito via email.",
    "Gruppo P&C",
  ].join("\n\n");
}

/** Amministratore: crea il link calendario a chi non l'ha ancora e manda a ogni collega attivo il suo, con le istruzioni. */
export async function inviaLinkCalendarioATutti(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.ruolo !== "AMMINISTRATORE") redirect(ritorno(formData, "/calendario/sul-telefono", "Solo l'amministratore può mandare i link a tutti."));
  const { APP_URL, inviaMail } = await import("@/lib/mail/invio");
  const solo = str(formData, "utenteId");
  const team = await prisma.utente.findMany({ where: { stato: "ATTIVO", ...(solo ? { id: solo } : {}) }, select: { id: true, nome: true, email: true, calendarioToken: true } });
  let inviati = 0;
  const falliti: string[] = [];
  for (const p of team) {
    if (!/.+@.+\..+/.test(p.email) || p.email.endsWith(".invalid")) { falliti.push(`${p.nome} (senza email)`); continue; }
    const token = p.calendarioToken ?? randomBytes(24).toString("base64url");
    if (!p.calendarioToken) await prisma.utente.update({ where: { id: p.id }, data: { calendarioToken: token } });
    const e = await inviaMail({ a: [p.email], oggetto: "Il tuo calendario del CRM sul telefono", testo: emailLinkCalendario(p.nome, `${APP_URL}/api/calendario/${token}`) });
    if (e.inviata) inviati++; else falliti.push(`${p.nome} (${e.motivo ?? "non partita"})`);
  }
  revalidatePath("/calendario/sul-telefono");
  redirect(ritorno(formData, "/calendario/sul-telefono", `Link del calendario mandato a ${inviati} ${inviati === 1 ? "persona" : "persone"}.${falliti.length ? ` Non partito: ${falliti.join(", ")}.` : ""}`));
}
