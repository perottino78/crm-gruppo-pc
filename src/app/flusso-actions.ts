"use server";

import { ricalcolaStatoCommessa } from "@/lib/pratica/stato-server";
import { statoSogliaRilievo } from "@/lib/pratica/soglia-server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { inviaMail, mailConfigurata, APP_URL } from "@/lib/mail/invio";
import { ringraziaPagamentoAcconto } from "@/lib/pratica/mail-cliente-server";
import { FASI_DEFAULT, STATI_CHE_AVANZANO, STATI_CHIUSI, STATI_TASK, compila, nomeUfficio, VERSIONE_TESTI_FLUSSO, FASI_TESTI_AGGIORNATI } from "@/lib/flusso";
import { residuoScadenza } from "@/lib/amministrazione/server";
import { costoLavoro, durataLeggibile, numeroIt } from "@/lib/pratica/costo-lavoro";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// Garantisce che le fasi di default esistano (prima lettura)
export async function assicuraFlusso() {
  if (!(await getCurrentUser())) return;
  const esistenti = new Set((await prisma.flussoFase.findMany({ select: { chiave: true } })).map((f) => f.chiave));
  // di partenza tutte le fasi; poi solo quelle che mancano (le fasi già modificate dall'amministratore non si toccano)
  const mancanti = FASI_DEFAULT.map((f, i) => ({ f, i })).filter(({ f }) => !esistenti.has(f.chiave));
  await allineaTestiFlusso();
  if (!mancanti.length) return;
  await prisma.flussoFase.createMany({
    skipDuplicates: true,
    data: mancanti.map(({ f, i }) => ({
      chiave: f.chiave, ordine: i + 1, nome: f.nome, ufficio: f.ufficio, prossimaChiave: f.prossimaChiave,
      taskAttivo: true, taskTitolo: f.taskTitolo, taskTesto: f.taskTesto,
      mailAttiva: f.mailAttiva ?? false, mailQuando: f.mailQuando ?? "FATTO", mailDestinatario: f.mailDestinatario ?? "CLIENTE",
      mailOggetto: f.mailOggetto ?? null, mailTesto: f.mailTesto ?? null,
    })),
  });
}

/** Una volta per versione: nome e testi del task delle fasi cambiate (es. Giorgia: prima il progetto, poi fattura e chiamata). Uffici, catena e mail non si toccano. */
async function allineaTestiFlusso() {
  const chiave = "flusso_testi_versione";
  const c = await prisma.configurazione.findUnique({ where: { chiave }, select: { valore: true } });
  if (c?.valore === VERSIONE_TESTI_FLUSSO) return;
  for (const f of FASI_DEFAULT.filter((x) => FASI_TESTI_AGGIORNATI.includes(x.chiave))) {
    await prisma.flussoFase.updateMany({ where: { chiave: f.chiave }, data: { nome: f.nome, taskTitolo: f.taskTitolo, taskTesto: f.taskTesto } });
  }
  await prisma.configurazione.upsert({ where: { chiave }, create: { chiave, valore: VERSIONE_TESTI_FLUSSO }, update: { valore: VERSIONE_TESTI_FLUSSO } });
}

async function variabili(commessaId: string, ufficioPrec?: string | null) {
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { cliente: true, preventivo: true, responsabile: true } });
  if (!c) return null;
  const v = {
    cliente: c.cliente.nome,
    commessa: `${c.numero}/${c.anno}`,
    offerta: c.preventivo.numeroOfferta ? String(c.preventivo.numeroOfferta) : "",
    importo: c.totaleVendita.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean }),
    commerciale: c.responsabile?.nome ?? "",
    ufficioPrecedente: nomeUfficio(ufficioPrec),
  };
  return { c, v };
}

// Avvia una fase: crea il task per l'ufficio responsabile (se attivo) e, se previsto, la bozza email
export async function avviaFaseFlusso(commessaId: string, chiave: string, daUfficio?: string | null, creatoDa?: string | null) {
  if (!(await getCurrentUser())) return;
  await assicuraFlusso();
  // la fattura d'acconto (Giorgia) e l'incasso con la creazione del progetto (Debora) partono insieme
  if (chiave === "FATT_ACCONTO" && !(await prisma.commessa.findUnique({ where: { id: commessaId }, select: { ordineBC: true } }))?.ordineBC) await avviaFaseFlusso(commessaId, "PROGETTO", daUfficio, creatoDa);
  const f = await prisma.flussoFase.findUnique({ where: { chiave } });
  if (!f) return;
  const ctx = await variabili(commessaId, daUfficio);
  if (!ctx) return;
  const { c, v } = ctx;
  // niente doppioni: se il task di questa fase è già aperto non se ne crea un secondo (Ugo 22/11/2026: «Confermare il materiale» compariva due volte)
  const giaAperto = f.taskAttivo ? await prisma.taskPratica.findFirst({ where: { commessaId, faseChiave: f.chiave, completatoIl: null, stato: { notIn: STATI_CHIUSI } }, select: { id: true } }) : null;
  if (f.taskAttivo && !giaAperto) {
    const mail = f.mailAttiva && f.mailQuando === "INIZIO";
    const nuovo = await prisma.taskPratica.create({
      data: {
        commessaId, faseChiave: f.chiave, titolo: compila(f.taskTitolo, v), descrizione: compila(f.taskTesto, v) || null,
        ufficio: f.ufficio, creatoDa: creatoDa ?? null,
        assegnatoUtenteId: f.ufficio === "COMMERCIALE" ? c.responsabileId : null,
        assegnatoNome: f.ufficio === "COMMERCIALE" ? c.responsabile?.nome ?? null : null,
        ...(mail ? bozzaMail(f, c.cliente.email, v) : {}),
      },
    });
    await prisma.commessaEvento.create({ data: { commessaId, utenteNome: creatoDa ?? null, testo: `Task per ${nomeUfficio(f.ufficio)}: ${compila(f.taskTitolo, v)}` } });
    if (f.avvisaUfficio) await avvisaUfficioTask(nuovo.id);
    if (mail && f.mailAutomatica) await spedisciMailTask(nuovo.id, creatoDa ?? null);
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
    await assicuraFlusso();
    const f = await prisma.flussoFase.findUnique({ where: { chiave: t.faseChiave } });
    if (f) {
      if (f.mailAttiva && f.mailQuando === "FATTO") {
        const ctx = await variabili(t.commessaId, t.ufficio);
        if (ctx) await prisma.taskPratica.update({ where: { id: taskId }, data: bozzaMail(f, ctx.c.cliente.email, ctx.v) });
        if (ctx && f.mailAutomatica) await spedisciMailTask(taskId, u.nome);
      }
      if (f.prossimaChiave) await avviaFaseFlusso(t.commessaId, f.prossimaChiave, t.ufficio, u.nome);
    }
  }
  revalidatePath("/task");
  revalidatePath(`/commesse/${t.commessaId}`);
}

/** La pratica di una scadenza d'incasso: quella della scadenza o quella della fattura di vendita collegata. */
export async function praticaDiIncasso(scadenzaId: string): Promise<string | null> {
  const s = await prisma.scadenza.findUnique({ where: { id: scadenzaId }, select: { tipo: true, commessaId: true, fatturaVenditaId: true } });
  if (!s || s.tipo !== "INCASSO") return null;
  if (s.commessaId) return s.commessaId;
  if (!s.fatturaVenditaId) return null;
  return (await prisma.fatturaVendita.findUnique({ where: { id: s.fatturaVenditaId }, select: { commessaId: true } }))?.commessaId ?? null;
}

/**
 * Incasso registrato su una pratica (scadenzario, banca o «acconto incassato» in commessa):
 * se la pratica è ferma alla «Fattura acconto» la fase si chiude da sola e parte il task dell'ufficio successivo;
 * se la pratica è pagata tutta e aspetta la «Fattura saldo», si chiude anche quella (parte la posa).
 */
export async function avanzaDopoIncasso(commessaId: string, quando: Date = new Date(), opz: { ringrazia?: boolean } = {}): Promise<string[]> {
  const u = await getCurrentUser();
  if (!u) return [];
  const c = await prisma.commessa.findUnique({ where: { id: commessaId }, include: { tasks: { where: { completatoIl: null, stato: { notIn: STATI_CHIUSI } }, orderBy: { createdAt: "asc" } } } });
  if (!c) return [];
  // quanto ha pagato davvero il cliente su questa pratica (scadenze della commessa e delle sue fatture di vendita)
  const fatture = await prisma.fatturaVendita.findMany({ where: { commessaId }, select: { id: true } });
  const scadenze = await prisma.scadenza.findMany({
    where: { tipo: "INCASSO", stato: { notIn: ["ANNULLATA", "SOSTITUITA"] }, OR: [{ commessaId }, ...(fatture.length ? [{ fatturaVenditaId: { in: fatture.map((f) => f.id) } }] : [])] },
    include: { abbinamenti: { select: { importo: true } } },
  });
  const pagato = scadenze.reduce((t, s) => t + Math.max(0, s.importo - residuoScadenza(s)), 0);
  const giorno = quando.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  if (pagato > 0.5 && !c.accontoIncassato && c.accontoTipo !== "FINANZIAMENTO") {
    await prisma.commessa.update({ where: { id: commessaId }, data: { accontoIncassato: true, accontoIncassatoIl: quando, accontoImportoIncassato: Math.round(Math.min(pagato, c.accontoImporto || pagato) * 100) / 100 } });
    // il ringraziamento al cliente parte solo con la spunta di chi registra l'incasso (Ugo, 21/11/2026)
    if (opz.ringrazia) await ringraziaPagamentoAcconto(commessaId);
  }
  // ogni incasso (anche una rata intermedia) può portare la pratica al 50%: allora si chiude il task di Debora e parte il rilievo
  if (pagato > 0.5 && c.accontoTipo !== "FINANZIAMENTO") await dopoIncassoAcconto(commessaId);
  const tutto = c.totaleVendita > 0 && pagato >= c.totaleVendita - 0.5;
  const chiuse: string[] = [];
  for (const t of c.tasks) {
    // la fattura d'acconto la chiude Giorgia (Fatturazione); l'incasso lo segna l'amministrazione e il task «incasso e progetto» si chiude con «Crea progetto»
    const daChiudere = (t.faseChiave === "FATT_SALDO" || (t.faseChiave === "MATERIALE_COMPLETO" && t.ufficio === "FATTURAZIONE")) && tutto;
    if (!daChiudere) continue;
    const nota = `Saldo incassato il ${giorno}: fase chiusa in automatico.`;
    await prisma.taskPratica.update({ where: { id: t.id }, data: { descrizione: [t.descrizione, nota].filter(Boolean).join("\n\n") } });
    await completa(t.id, "COMPLETATO");
    chiuse.push(t.titolo);
  }
  return chiuse;
}

/**
 * Il centralino fissa il rilievo quando la pratica è pronta: progetto creato (Giorgia) E acconto incassato o finanziamento approvato (Debora).
 * Si chiama da tutti e due i lati; parte una volta sola.
 */
export async function avviaRilievoSePronto(commessaId: string): Promise<boolean> {
  const c = await prisma.commessa.findUnique({
    where: { id: commessaId },
    select: { progettoCreatoIl: true, accontoTipo: true, accontoIncassato: true, finanziamentoStato: true, ordineBC: true, rilievi: { select: { id: true } }, tasks: { where: { faseChiave: "RILIEVO_APP" }, select: { id: true } } },
  });
  if (!c || !c.progettoCreatoIl || c.tasks.length > 0 || c.rilievi.length > 0) return false;
  if (!(await statoSogliaRilievo(commessaId))?.viaLibera) return false;
  await avviaFaseFlusso(commessaId, "RILIEVO_APP", "AMMINISTRAZIONE");
  return true;
}

/**
 * Dopo ogni incasso (o finanziamento approvato): quando la pratica ha il 50% incassato (o il finanziamento approvato, o lo sblocco
 * dell'amministratore) si chiude il task di incasso di Debora e, se il progetto c'è già, parte il rilievo. Sotto il 50% resta tutto aperto.
 */
export async function dopoIncassoAcconto(commessaId: string): Promise<void> {
  if (!(await statoSogliaRilievo(commessaId))?.viaLibera) return;
  await ricalcolaStatoCommessa(commessaId);
  await chiudiTaskFase(commessaId, "PROGETTO");
  await avviaRilievoSePronto(commessaId);
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

// Invio vero della email preparata nel task (pulsante "Invia ora")
export async function inviaMailTask(formData: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(formData, "taskId");
  if (!id) return;
  const a = str(formData, "mailA");
  if (a) await prisma.taskPratica.update({ where: { id }, data: { mailA: a } });
  const t = await spedisciMailTask(id, u.nome);
  revalidatePath("/task");
  if (t) revalidatePath(`/commesse/${t}`);
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
  const tm = await prisma.taskPratica.create({ data: { commessaId, ufficio, titolo, descrizione: str(formData, "descrizione"), creatoDa: u.nome } });
  await avvisaUfficioTask(tm.id);
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
      avvisaUfficio: formData.get("avvisaUfficio") === "on",
      mailAutomatica: formData.get("mailAutomatica") === "on",
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

// ── Email automatiche ─────────────────────────────────────────────────────────
// Avviso interno: chi lavora nell'ufficio del task riceve una email con il link alla pratica.
async function avvisaUfficioTask(taskId: string) {
  if (!(await mailConfigurata())) return;
  const t = await prisma.taskPratica.findUnique({ where: { id: taskId }, include: { commessa: { include: { cliente: true } } } });
  if (!t) return;
  const destinatari = await prisma.utente.findMany({
    where: { stato: "ATTIVO", ...(t.assegnatoUtenteId ? { id: t.assegnatoUtenteId } : { ufficio: t.ufficio }) },
    select: { email: true },
  });
  const num = `C${t.commessa.anno}-${String(t.commessa.numero).padStart(3, "0")}`;
  const esito = await inviaMail({
    a: destinatari.map((d) => d.email),
    oggetto: `[CRM P&C] Nuovo task per ${nomeUfficio(t.ufficio)}: ${t.titolo} — ${t.commessa.cliente.nome}`,
    testo: [
      `Nuovo task per l'ufficio ${nomeUfficio(t.ufficio)}.`,
      ``,
      `Pratica: ${num} — ${t.commessa.cliente.nome}`,
      `Task: ${t.titolo}`,
      t.descrizione ? `\n${t.descrizione}` : "",
      ``,
      `Apri la pratica: ${APP_URL}/commesse/${t.commessaId}`,
      `Tutti i task: ${APP_URL}/task`,
    ].join("\n"),
  });
  if (esito.inviata) await prisma.taskPratica.update({ where: { id: taskId }, data: { avvisoInviatoIl: new Date() } });
}

// Email della fase (di solito al cliente): la spedisce davvero e la segna come inviata. Ritorna l'id commessa.
async function spedisciMailTask(taskId: string, chi: string | null): Promise<string | null> {
  const t = await prisma.taskPratica.findUnique({ where: { id: taskId }, include: { commessa: { include: { responsabile: true } } } });
  if (!t || t.mailInviataIl || !t.mailA || !(t.mailOggetto || t.mailTesto)) return t?.commessaId ?? null;
  const esito = await inviaMail({ a: t.mailA.split(/[;,]/), oggetto: t.mailOggetto ?? "", testo: t.mailTesto ?? "", rispondiA: t.commessa.responsabile?.email, daUtenteId: t.commessa.responsabileId });
  await prisma.commessaEvento.create({
    data: {
      commessaId: t.commessaId,
      utenteNome: chi,
      testo: esito.inviata ? `Email "${t.mailOggetto ?? ""}" inviata a ${t.mailA}.` : `Email "${t.mailOggetto ?? ""}" NON inviata (${esito.motivo}): resta da inviare a mano.`,
    },
  });
  if (esito.inviata) await prisma.taskPratica.update({ where: { id: taskId }, data: { mailInviataIl: new Date() } });
  return t.commessaId;
}

/** Chiude il task aperto di una fase della pratica (se c'è) e fa partire la fase successiva del flusso. */
export async function chiudiTaskFase(commessaId: string, faseChiave: string, assegnaProssimoA?: { id: string; nome: string } | null): Promise<boolean> {
  const t = await prisma.taskPratica.findFirst({ where: { commessaId, faseChiave, completatoIl: null, stato: { notIn: STATI_CHIUSI } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!t) return false;
  const prima = new Date();
  await completa(t.id, "COMPLETATO");
  // il task che nasce (es. rilievo) si assegna a una persona precisa (il rilevatore scelto dal centralino)
  if (assegnaProssimoA) {
    await prisma.taskPratica.updateMany({ where: { commessaId, createdAt: { gte: prima }, completatoIl: null, assegnatoUtenteId: null }, data: { assegnatoUtenteId: assegnaProssimoA.id, assegnatoNome: assegnaProssimoA.nome } });
  }
  return true;
}

/**
 * Costo dell'operatore per la fase di un task della pratica: minuti × costo orario / 60.
 * Va nei costi della commessa (voce Manodopera). Minuti vuoti = si toglie il costo.
 */
export async function salvaCostoTask(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(fd, "taskId");
  if (!id) return;
  const t = await prisma.taskPratica.findUnique({ where: { id }, select: { id: true, commessaId: true, titolo: true } });
  if (!t) return;
  const minuti = (() => { const n = numeroIt(fd.get("minuti")); return n !== null && n > 0 ? Math.min(Math.round(n), 60 * 24 * 30) : null; })();
  const orario = (() => { const n = numeroIt(fd.get("costoOrario")); return n !== null && n > 0 ? Math.min(n, 10000) : null; })();
  if (minuti !== null && orario === null) return; // serve anche il costo orario
  const costo = costoLavoro(minuti, orario);
  await prisma.taskPratica.update({ where: { id }, data: { minuti, costoOrario: minuti === null ? null : orario, costoLavoro: minuti === null ? 0 : costo, lavoroDaNome: minuti === null ? null : u.nome } });
  await prisma.commessaEvento.create({ data: { commessaId: t.commessaId, utenteNome: u.nome, testo: minuti === null ? `Costo dell'operatore tolto dal passaggio «${t.titolo}».` : `Costo dell'operatore per «${t.titolo}»: ${durataLeggibile(minuti)} × ${orario} €/h = ${costo.toFixed(2)} € (nei costi della commessa, manodopera).` } });
  revalidatePath(`/commesse/${t.commessaId}`);
}
