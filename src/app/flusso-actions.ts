"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { FASI_DEFAULT, STATI_CHE_AVANZANO, STATI_TASK, compila, nomeUfficio } from "@/lib/flusso";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// Garantisce che le fasi di default esistano (prima lettura)
export async function assicuraFlusso() {
  if (!(await getCurrentUser())) return;
  const n = await prisma.flussoFase.count();
  if (n > 0) return;
  await prisma.flussoFase.createMany({
    data: FASI_DEFAULT.map((f, i) => ({
      chiave: f.chiave, ordine: i + 1, nome: f.nome, ufficio: f.ufficio, prossimaChiave: f.prossimaChiave,
      taskAttivo: true, taskTitolo: f.taskTitolo, taskTesto: f.taskTesto,
      mailAttiva: f.mailAttiva ?? false, mailQuando: f.mailQuando ?? "FATTO", mailDestinatario: f.mailDestinatario ?? "CLIENTE",
      mailOggetto: f.mailOggetto ?? null, mailTesto: f.mailTesto ?? null,
    })),
  });
}

async function variabili(commessaId: string, ufficioPrec?: string | null) {
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { cliente: true, preventivo: true, responsabile: true } });
  if (!c) return null;
  const v = {
    cliente: c.cliente.nome,
    commessa: `${c.numero}/${c.anno}`,
    offerta: c.preventivo.numeroOfferta ? String(c.preventivo.numeroOfferta) : "",
    importo: c.totaleVendita.toLocaleString("it-IT", { style: "currency", currency: "EUR" }),
    commerciale: c.responsabile?.nome ?? "",
    ufficioPrecedente: nomeUfficio(ufficioPrec),
  };
  return { c, v };
}

// Avvia una fase: crea il task per l'ufficio responsabile (se attivo) e, se previsto, la bozza email
export async function avviaFaseFlusso(commessaId: string, chiave: string, daUfficio?: string | null, creatoDa?: string | null) {
  if (!(await getCurrentUser())) return;
  await assicuraFlusso();
  const f = await prisma.flussoFase.findUnique({ where: { chiave } });
  if (!f) return;
  const ctx = await variabili(commessaId, daUfficio);
  if (!ctx) return;
  const { c, v } = ctx;
  if (f.taskAttivo) {
    const mail = f.mailAttiva && f.mailQuando === "INIZIO";
    await prisma.taskPratica.create({
      data: {
        commessaId, faseChiave: f.chiave, titolo: compila(f.taskTitolo, v), descrizione: compila(f.taskTesto, v) || null,
        ufficio: f.ufficio, creatoDa: creatoDa ?? null,
        assegnatoUtenteId: f.ufficio === "COMMERCIALE" ? c.responsabileId : null,
        assegnatoNome: f.ufficio === "COMMERCIALE" ? c.responsabile?.nome ?? null : null,
        ...(mail ? bozzaMail(f, c.cliente.email, v) : {}),
      },
    });
    await prisma.commessaEvento.create({ data: { commessaId, utenteNome: creatoDa ?? null, testo: `Task per ${nomeUfficio(f.ufficio)}: ${compila(f.taskTitolo, v)}` } });
  }
}

function bozzaMail(f: { mailDestinatario: string; mailOggetto: string | null; mailTesto: string | null }, emailCliente: string | null, v: Record<string, string>) {
  return {
    mailA: f.mailDestinatario === "CLIENTE" ? emailCliente : null,
    mailOggetto: compila(f.mailOggetto, v) || null,
    mailTesto: compila(f.mailTesto, v) || null,
  };
}

async function completa(taskId: string, stato: string) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const t = await prisma.taskPratica.findUnique({ where: { id: taskId } });
  if (!t) return;
  const giaChiuso = !!t.completatoIl;
  const avanza = STATI_CHE_AVANZANO.includes(stato) && !giaChiuso;
  await prisma.taskPratica.update({
    where: { id: taskId },
    data: {
      stato,
      ...(avanza ? { completatoIl: new Date(), completatoDaNome: u.nome } : {}),
      ...(!t.assegnatoUtenteId && stato !== "DA_INIZIARE" ? { assegnatoUtenteId: u.id, assegnatoNome: u.nome } : {}),
    },
  });
  await prisma.commessaEvento.create({ data: { commessaId: t.commessaId, utenteNome: u.nome, testo: `Task "${t.titolo}" (${nomeUfficio(t.ufficio)}): ${STATI_TASK.find((s) => s.chiave === stato)?.nome ?? stato}.` } });
  if (avanza && t.faseChiave) {
    const f = await prisma.flussoFase.findUnique({ where: { chiave: t.faseChiave } });
    if (f) {
      if (f.mailAttiva && f.mailQuando === "FATTO") {
        const ctx = await variabili(t.commessaId, t.ufficio);
        if (ctx) await prisma.taskPratica.update({ where: { id: taskId }, data: bozzaMail(f, ctx.c.cliente.email, ctx.v) });
      }
      if (f.prossimaChiave) await avviaFaseFlusso(t.commessaId, f.prossimaChiave, t.ufficio, u.nome);
    }
  }
  revalidatePath("/task");
  revalidatePath(`/commesse/${t.commessaId}`);
}

export async function fattoTask(formData: FormData) {
  const id = str(formData, "taskId");
  if (id) await completa(id, "COMPLETATO");
}

export async function cambiaStatoTask(formData: FormData) {
  const id = str(formData, "taskId");
  const stato = str(formData, "stato");
  if (!id || !stato || !STATI_TASK.some((s) => s.chiave === stato)) return;
  await completa(id, stato);
}

export async function prendiInCaricoTask(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "taskId");
  if (!id) return;
  const t = await prisma.taskPratica.update({ where: { id }, data: { assegnatoUtenteId: u.id, assegnatoNome: u.nome, stato: "IN_CORSO" } });
  revalidatePath("/task");
  revalidatePath(`/commesse/${t.commessaId}`);
}

export async function segnaMailTaskInviata(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "taskId");
  if (!id) return;
  const t = await prisma.taskPratica.update({ where: { id }, data: { mailInviataIl: new Date() } });
  await prisma.commessaEvento.create({ data: { commessaId: t.commessaId, utenteNome: u.nome, testo: `Email "${t.mailOggetto ?? ""}" segnata come inviata.` } });
  revalidatePath("/task");
  revalidatePath(`/commesse/${t.commessaId}`);
}

// Task libero fra uffici (non legato a una fase): "manda questa pratica all'ufficio X"
export async function creaTaskManuale(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "commessaId");
  const ufficio = str(formData, "ufficio");
  const titolo = str(formData, "titolo");
  if (!commessaId || !ufficio || !titolo) return;
  await prisma.taskPratica.create({ data: { commessaId, ufficio, titolo, descrizione: str(formData, "descrizione"), creatoDa: u.nome } });
  await prisma.commessaEvento.create({ data: { commessaId, utenteNome: u.nome, testo: `Task per ${nomeUfficio(ufficio)}: ${titolo}` } });
  revalidatePath("/task");
  revalidatePath(`/commesse/${commessaId}`);
}

// ===== Impostazioni (solo amministratore) =====
function soloAdmin(u: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!u || !isAmministratore(u)) redirect("/impostazioni");
}

export async function salvaFlussoFase(formData: FormData) {
  soloAdmin(await getCurrentUser());
  const id = str(formData, "id");
  if (!id) return;
  await prisma.flussoFase.update({
    where: { id },
    data: {
      nome: str(formData, "nome") ?? "Fase",
      ufficio: str(formData, "ufficio") ?? "COMMERCIALE",
      prossimaChiave: str(formData, "prossimaChiave"),
      ordine: Number(str(formData, "ordine") ?? 0) || 0,
      taskAttivo: formData.get("taskAttivo") === "on",
      taskTitolo: str(formData, "taskTitolo") ?? "Task",
      taskTesto: str(formData, "taskTesto"),
      mailAttiva: formData.get("mailAttiva") === "on",
      mailQuando: str(formData, "mailQuando") ?? "FATTO",
      mailDestinatario: str(formData, "mailDestinatario") ?? "CLIENTE",
      mailOggetto: str(formData, "mailOggetto"),
      mailTesto: str(formData, "mailTesto"),
    },
  });
  revalidatePath("/impostazioni/flusso");
}

export async function creaFlussoFase(formData: FormData) {
  soloAdmin(await getCurrentUser());
  const nome = str(formData, "nome");
  if (!nome) return;
  const ult = await prisma.flussoFase.findFirst({ orderBy: { ordine: "desc" } });
  const chiave = nome.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 30) + "_" + Date.now().toString(36).toUpperCase();
  await prisma.flussoFase.create({
    data: { chiave, nome, ordine: (ult?.ordine ?? 0) + 1, ufficio: str(formData, "ufficio") ?? "COMMERCIALE", taskTitolo: nome, taskTesto: "Pratica {commessa} di {cliente}." },
  });
  revalidatePath("/impostazioni/flusso");
}

export async function eliminaFlussoFase(formData: FormData) {
  soloAdmin(await getCurrentUser());
  const id = str(formData, "id");
  if (!id) return;
  const f = await prisma.flussoFase.delete({ where: { id } });
  await prisma.flussoFase.updateMany({ where: { prossimaChiave: f.chiave }, data: { prossimaChiave: null } });
  revalidatePath("/impostazioni/flusso");
}

export async function aggiornaUfficioUtente(formData: FormData) {
  soloAdmin(await getCurrentUser());
  const utenteId = str(formData, "utenteId");
  if (!utenteId) return;
  await prisma.utente.update({ where: { id: utenteId }, data: { ufficio: str(formData, "ufficio") } });
  revalidatePath("/impostazioni");
}

// Per commesse già esistenti: avvia il flusso dalla prima fase scelta (default Accettazione)
export async function avviaFlussoCommessa(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const commessaId = str(formData, "commessaId");
  if (!commessaId) return;
  const esiste = await prisma.taskPratica.count({ where: { commessaId } });
  if (esiste > 0) return;
  await avviaFaseFlusso(commessaId, str(formData, "fase") ?? "ACCETTAZIONE", null, u.nome);
  revalidatePath(`/commesse/${commessaId}`);
  revalidatePath("/task");
}
