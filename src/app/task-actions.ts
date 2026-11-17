"use server";

// Task come «corrispondenza interna» (richiesta di Ugo, 18/11/2026, sul modello dei task di BConsole): descrizione, commenti, file, in copia a,
// categoria, ore previste, scadenza e stato. Si inseriscono richieste, si risponde dicendo cosa è stato fatto e si chiude il task:
// resta così la traccia dell'avanzamento. Gli avvisi via email non bloccano mai il lavoro.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { daOraRoma } from "@/lib/calendario/tempo";
import { inviaMail, APP_URL } from "@/lib/mail/invio";
import { puoVedereTask, coinvolti } from "@/lib/task/permessi";
import { fattoTask } from "@/app/flusso-actions";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const lista = (fd: FormData, k: string) => fd.getAll(k).filter((x): x is string => typeof x === "string" && !!x.trim());
const torna = (id: string, tab: string, p: Record<string, string> = {}) => redirect(`/task/${id}?${new URLSearchParams({ tab, ...p })}`);

/** Avvisa per email le persone indicate (mai l'autore); non lancia errori. */
async function avvisa(ids: string[], daId: string, oggetto: string, testo: string, link: string): Promise<number> {
  try {
    const persone = await prisma.utente.findMany({ where: { id: { in: ids.filter((x) => x !== daId) }, stato: "ATTIVO", email: { not: "" } }, select: { email: true, nome: true } });
    let n = 0;
    for (const p of persone) {
      const r = await inviaMail({ a: [p.email], oggetto: `[CRM P&C] ${oggetto}`, testo: `Ciao ${p.nome.split(" ")[0]},\n\n${testo}\n\nApri il task: ${link}`, daUtenteId: daId });
      if (r.inviata) n++;
    }
    return n;
  } catch (e) {
    console.error("avvisa task", e);
    return 0;
  }
}

async function caricaTask(id: string | null) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!id) redirect("/task");
  if (!(await puoVedereTask(u!, id!))) redirect("/task");
  const t = await prisma.attivita.findUnique({ where: { id: id! }, include: { cliente: { select: { id: true, nome: true } } } });
  if (!t) redirect("/task");
  return { u: u!, t: t! };
}

/** Commento sul task; con «chiudi» il commento diventa la risposta di chiusura (cosa è stato fatto) e il task si chiude. */
export async function commentaTask(fd: FormData) {
  const { u, t } = await caricaTask(str(fd, "id"));
  const testo = str(fd, "testo");
  const chiudi = fd.get("chiudi") === "1";
  if (!testo && !chiudi) torna(t.id, "commenti", { errore: "Scrivi il commento." });
  const corpo = testo ?? "Task chiuso.";
  await prisma.taskCommento.create({ data: { attivitaId: t.id, utenteId: u.id, utenteNome: u.nome, testo: corpo, chiusura: chiudi } });
  if (chiudi && !t.completata) await prisma.attivita.update({ where: { id: t.id }, data: { completata: true, completataIl: new Date(), statoTask: "FATTO" } });
  let avvisati = 0;
  if (fd.get("notifica") === "1" || (chiudi && t.notifica)) {
    avvisati = await avvisa(coinvolti(t), u.id, `${chiudi ? "Task chiuso" : "Nuovo commento"} da ${u.nome}: ${t.oggetto}`,
      `${u.nome} ${chiudi ? "ha chiuso il task" : "ha scritto un commento sul task"} «${t.oggetto}» (cliente ${t.cliente.nome}):\n\n${corpo}`, `${APP_URL}/task/${t.id}?tab=commenti`);
  }
  revalidatePath(`/task/${t.id}`);
  revalidatePath("/task");
  revalidatePath("/");
  torna(t.id, "commenti", { ok: chiudi ? `Task chiuso con la tua risposta${avvisati ? ` (avvisate ${avvisati} persone)` : ""}.` : `Commento aggiunto${avvisati ? ` (avvisate ${avvisati} persone)` : ""}.` });
}

export async function salvaDescrizioneTask(fd: FormData) {
  const { t } = await caricaTask(str(fd, "id"));
  const oggetto = str(fd, "oggetto") ?? t.oggetto;
  await prisma.attivita.update({ where: { id: t.id }, data: { oggetto, descrizione: str(fd, "descrizione") } });
  revalidatePath(`/task/${t.id}`);
  torna(t.id, "descrizione", { ok: "Descrizione salvata." });
}

/** «Info sul task»: assegnato a, in copia a, stato, categoria, ore previste, scadenza, avvisi. */
export async function salvaInfoTask(fd: FormData) {
  const { u, t } = await caricaTask(str(fd, "id"));
  const per = str(fd, "utenteId");
  const nuovoIncaricato = per ? await prisma.utente.findFirst({ where: { id: per, OR: [{ stato: "ATTIVO" }, { id: t.utenteId ?? "" }] }, select: { id: true, nome: true } }) : null;
  const stato = ["DA_FARE", "IN_CORSO", "FATTO"].includes(str(fd, "statoTask") ?? "") ? str(fd, "statoTask")! : t.statoTask;
  const ore = str(fd, "orePreviste") ? parseFloat(str(fd, "orePreviste")!.replace(",", ".")) : null;
  const copia = (await prisma.utente.findMany({ where: { id: { in: lista(fd, "inCopiaA") }, stato: "ATTIVO" }, select: { id: true } })).map((x) => x.id);
  const fatto = stato === "FATTO";
  await prisma.attivita.update({
    where: { id: t.id },
    data: {
      ...(nuovoIncaricato ? { utenteId: nuovoIncaricato.id } : {}), inCopiaA: copia, statoTask: stato, completata: fatto, completataIl: fatto ? t.completataIl ?? new Date() : null,
      categoria: str(fd, "categoria"), orePreviste: ore !== null && Number.isFinite(ore) && ore >= 0 ? ore : null, notifica: fd.get("notifica") === "1",
      scadenza: str(fd, "scadenza") ? daOraRoma(`${str(fd, "scadenza")}T12:00`) : null,
    },
  });
  // avvisa chi riceve il task adesso e chi è stato messo in copia adesso
  if (nuovoIncaricato && nuovoIncaricato.id !== t.utenteId) await avvisa([nuovoIncaricato.id], u.id, `Task affidato da ${u.nome}: ${t.oggetto}`, `${u.nome} ti ha affidato il task «${t.oggetto}» (cliente ${t.cliente.nome}).`, `${APP_URL}/task/${t.id}`);
  const nuoviInCopia = copia.filter((x) => !t.inCopiaA.includes(x));
  if (nuoviInCopia.length) await avvisa(nuoviInCopia, u.id, `In copia su un task: ${t.oggetto}`, `${u.nome} ti ha messo in copia sul task «${t.oggetto}» (cliente ${t.cliente.nome}).`, `${APP_URL}/task/${t.id}`);
  revalidatePath(`/task/${t.id}`);
  revalidatePath("/task");
  revalidatePath("/");
  torna(t.id, "info", { ok: "Informazioni del task salvate." });
}

/** Commento su un task di pratica (fra uffici); con «chiudi» lo segna anche «Fatto» e la pratica passa all'ufficio dopo. */
export async function commentaTaskPratica(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const taskId = str(fd, "taskId");
  const testo = str(fd, "testo");
  if (!taskId || !testo) return;
  const t = await prisma.taskPratica.findUnique({ where: { id: taskId }, select: { id: true, commessaId: true, titolo: true, creatoDa: true, assegnatoUtenteId: true, completatoIl: true } });
  if (!t) return;
  const chiudi = fd.get("chiudi") === "1";
  await prisma.taskCommento.create({ data: { taskPraticaId: t.id, utenteId: u.id, utenteNome: u.nome, testo, chiusura: chiudi } });
  await prisma.commessaEvento.create({ data: { commessaId: t.commessaId, utenteNome: u.nome, testo: `Commento sul task «${t.titolo}»: ${testo.slice(0, 200)}` } });
  if (fd.get("notifica") === "1" && t.assegnatoUtenteId) await avvisa([t.assegnatoUtenteId], u.id, `Commento sul task di pratica: ${t.titolo}`, `${u.nome} ha scritto sul task «${t.titolo}»:\n\n${testo}`, `${APP_URL}/commesse/${t.commessaId}`);
  if (chiudi && !t.completatoIl) { const f = new FormData(); f.set("taskId", t.id); await fattoTask(f); }
  revalidatePath("/task");
  revalidatePath(`/commesse/${t.commessaId}`);
}
