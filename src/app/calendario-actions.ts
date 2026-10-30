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
