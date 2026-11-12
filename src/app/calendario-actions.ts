"use server";

import { chiudiLeadDopoVisita } from "@/lib/appuntamenti/esiti-server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { daOraRoma, perInput, giornoBreve, chiaveGiorno, oraRoma } from "@/lib/calendario/tempo";
import { inviaInvito, invitaRiunione } from "@/lib/calendario/server";
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
  // visita svolta: il task del centralino sul lead si chiude da solo
  if (stato === "COMPLETATO" && (await chiudiLeadDopoVisita(id, u.nome))) msg = "Salvato: il task del centralino è chiuso.";
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

/** «Lo rifisso io»: il commerciale sposta l'appuntamento al giorno e all'ora che ha concordato con il cliente. */
export async function spostaAppuntamentoA(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "id");
  const quando = daOraRoma(str(formData, "dataOra"));
  if (!id) return;
  if (!quando) redirect(ritorno(formData, `/calendario/appuntamento/${id}`, "Scegli giorno e ora."));
  const a = await prisma.appuntamento.findUnique({ where: { id } });
  if (!a) return;
  const fd = new FormData();
  fd.set("id", id);
  fd.set("dataOra", perInput(quando!));
  fd.set("utenteId", a.utenteId);
  fd.set("tipo", a.tipo);
  fd.set("durataMin", String(a.durataMin));
  if (a.titolo) fd.set("titolo", a.titolo);
  if (a.luogo) fd.set("luogo", a.luogo);
  if (a.note) fd.set("note", a.note);
  // la spunta «manda la conferma anche al cliente» accanto a «Lo rifisso io»
  if (formData.get("invitaCliente") === "on") fd.set("invitaCliente", "on");
  return modificaAppuntamento(fd);
}

/**
 * «Da rifissare: ci pensa il centralino». L'appuntamento si chiude (annullato, con il motivo) e il lead torna alla
 * telefonista come «Appuntamento annullato · Definisci il seguito» per il giorno indicato. Se il cliente non viene da un
 * lead, se ne crea uno apposta così la telefonista lo trova nei suoi «Task di oggi».
 */
export async function rifissaDalCentralino(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "id");
  if (!id) return;
  // «❌ Appuntamento annullato» (richiesta di Rocco): non vuol dire «non interessato»; il centralino lo trova subito nei
  // task di oggi come «Motiva l'annullamento» e decide se richiamare più avanti o chiuderlo come non interessato
  const annullato = formData.get("annullato") === "1";
  const quando = (annullato ? null : daOraRoma(str(formData, "richiamaIl"))) ?? new Date();
  const note = str(formData, "note");
  const a = await prisma.appuntamento.findUnique({ where: { id }, include: { cliente: true } });
  if (!a) return;
  const { registraEsito } = await import("@/lib/automazioni/motore");
  const { esitiPossibili } = await import("@/lib/automazioni/percorsi");
  const { telefonistaDefaultPerBrand } = await import("@/lib/leadIngest");
  const testo = `${annullato ? "Annullato" : "Da rifissare"} (${u.nome}, appuntamento del ${giornoBreve(chiaveGiorno(a.dataOra))} ${oraRoma(a.dataOra)})${note ? `: ${note}` : ""}`;
  let lead = await prisma.lead.findFirst({ where: { appuntamentoId: a.id } })
    ?? (a.cliente.leadOrigineId ? await prisma.lead.findUnique({ where: { id: a.cliente.leadOrigineId } }) : null);
  if (lead && esitiPossibili(lead.fase).includes("APPUNTAMENTO_ANNULLATO")) {
    // stesso percorso di quando lo annulla il cliente: si fermano lettere e promemoria, avviso a centralino e venditore
    await registraEsito({ leadId: lead.id, esito: "APPUNTAMENTO_ANNULLATO", note: testo, utenteNome: u.nome });
  } else if (lead) {
    await prisma.lead.update({ where: { id: lead.id }, data: { fase: "APPUNTAMENTO_ANNULLATO", nonGestitoIl: null } });
    await prisma.leadEvento.create({ data: { leadId: lead.id, tipo: "lead.esito", testo, utenteNome: u.nome } });
  } else {
    const c = a.cliente;
    lead = await prisma.lead.create({
      data: {
        nome: c.nome, telefono: c.telefono ?? c.cellulare, email: c.email, brandId: c.brandId, fonte: "rifissare", fase: "APPUNTAMENTO_ANNULLATO",
        comune: c.comune, cap: c.cap, telefonistaId: await telefonistaDefaultPerBrand(c.brandId), note: `[${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} ${u.nome}] ${testo}`,
      },
    });
    await prisma.leadEvento.create({ data: { leadId: lead.id, tipo: "lead.esito", testo, utenteNome: u.nome } });
    if (!c.leadOrigineId) await prisma.cliente.update({ where: { id: c.id }, data: { leadOrigineId: lead.id } }).catch(() => null);
  }
  // la telefonista lo trova nei «Task di oggi» dal giorno scelto
  const l = await prisma.lead.update({ where: { id: lead!.id }, data: { scadenzaAzione: quando, telefonistaId: lead!.telefonistaId ?? (await telefonistaDefaultPerBrand(a.cliente.brandId)) }, include: { telefonista: { select: { nome: true } } } });
  await prisma.appuntamento.update({ where: { id }, data: { stato: "ANNULLATO", esito: testo } });
  await inviaInvito(`APPUNTAMENTO:${id}`, "CANCEL").catch(() => null);
  revalidatePath("/calendario");
  revalidatePath("/lead");
  revalidatePath(`/clienti/${a.clienteId}`);
  if (annullato) redirect(ritorno(formData, `/calendario/appuntamento/${id}`, `❌ Appuntamento annullato. ${l.telefonista?.nome ?? "La telefonista"} trova nei «Task di oggi» il task «Motiva l'annullamento»: richiamare più avanti o non interessato.`));
  redirect(ritorno(formData, `/calendario/appuntamento/${id}`, `📞 Mandato al centralino: ${l.telefonista?.nome ?? "la telefonista"} lo trova nei «Task di oggi» dal ${quando.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} per richiamare e rifissare.`));
}

/** Riunione interna (richiesta di Rocco): una o più persone del team, nessun cliente; l'invito parte da solo a tutti. */
export async function creaRiunione(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const dataOra = daOraRoma(str(formData, "dataOra"));
  const titolo = str(formData, "titolo") ?? "Riunione";
  const partecipanti = [...new Set(formData.getAll("partecipanti").map(String).filter(Boolean))];
  if (!dataOra) redirect(ritorno(formData, "/calendario", "Scegli giorno e ora della riunione."));
  if (!partecipanti.length) redirect(ritorno(formData, "/calendario", "Scegli almeno una persona del team per la riunione."));
  const validi = await prisma.utente.findMany({ where: { id: { in: partecipanti }, stato: "ATTIVO" }, select: { id: true } });
  const r = await prisma.riunione.create({
    data: {
      titolo, dataOra: dataOra!, partecipanti: validi.map((x) => x.id),
      durataMin: Math.max(15, Math.min(600, Number(str(formData, "durataMin") ?? 60) || 60)),
      luogo: str(formData, "luogo"), note: str(formData, "note"), creatoDaNome: u.nome,
    },
  });
  const e = await invitaRiunione(r.id);
  revalidatePath("/calendario");
  redirect(ritorno(formData, `/calendario?giorno=${chiaveGiorno(dataOra!)}`, `👥 Riunione salvata. ${e.inviati.length ? `Invito mandato a ${e.inviati.length} ${e.inviati.length === 1 ? "persona" : "persone"}.` : `Invito non inviato (${e.motivo ?? "nessuna email"}).`}`));
}

/** Annulla la riunione: sparisce dal calendario e i partecipanti ricevono l'annullamento. */
export async function annullaRiunione(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "id");
  if (!id) return;
  const r = await prisma.riunione.update({ where: { id }, data: { stato: "ANNULLATO" } });
  await invitaRiunione(id, "CANCEL");
  revalidatePath("/calendario");
  redirect(`/calendario?giorno=${chiaveGiorno(r.dataOra)}&msg=${encodeURIComponent("Riunione annullata: i partecipanti hanno ricevuto l'avviso.")}`);
}
