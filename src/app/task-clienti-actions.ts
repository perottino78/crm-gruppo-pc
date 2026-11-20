"use server";

// Task dalla scheda cliente (richiesta di Ugo, nov 2026): «✅ Task» apre «Nuovo task» da dare a chiunque del team.
// Il task è un'Attivita di tipo TASK sul cliente con l'incaricato; lo vede in «Task» (I miei task sui clienti) e sulla Dashboard,
// e gli arriva un'email di avviso (che non blocca mai il lavoro).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { scopeClienteWhere } from "@/lib/scope";
import { daOraRoma } from "@/lib/calendario/tempo";
import { inviaMail, APP_URL } from "@/lib/mail/invio";
import { convertiInWebp } from "@/lib/immagini/webp";
import { MAX_DOCUMENTO, nomeFileSicuro } from "@/lib/ordini/calcoli";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const vai = (dove: string, p: Record<string, string>) => redirect(`${dove}${dove.includes("?") ? "&" : "?"}${new URLSearchParams(p)}#task`);

export async function creaTaskCliente(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const clienteId = str(fd, "clienteId");
  const torna = `/clienti/${clienteId}?sez=task`;
  const cliente = clienteId ? await prisma.cliente.findFirst({ where: { id: clienteId, ...scopeClienteWhere(u!) }, select: { id: true, nome: true } }) : null;
  if (!cliente) redirect("/clienti");
  const oggetto = str(fd, "oggetto");
  if (!oggetto) vai(torna, { errore: "Scrivi cosa c'è da fare" });
  const per = await prisma.utente.findFirst({ where: { id: str(fd, "utenteId") ?? u!.id, stato: "ATTIVO" }, select: { id: true, nome: true, email: true } });
  if (!per) vai(torna, { errore: "Scegli una persona del team" });
  const scadenza = daOraRoma(str(fd, "scadenza"));
  const descrizione = str(fd, "descrizione");
  // coinvolti (anche più persone, ScegliPersone): tutti tranne l'incaricato, senza doppioni
  const idCopia = [...new Set(fd.getAll("inCopiaA").filter((x): x is string => typeof x === "string" && x !== per!.id))];
  const copia = (await prisma.utente.findMany({ where: { id: { in: idCopia }, stato: "ATTIVO" }, select: { id: true, email: true, nome: true } }));
  const ore = str(fd, "orePreviste") ? parseFloat(str(fd, "orePreviste")!.replace(",", ".")) : null;
  const creato = await prisma.attivita.create({
    data: {
      clienteId: cliente!.id, tipo: "TASK", oggetto: oggetto!, descrizione, scadenza, utenteId: per!.id, creatoDaId: u!.id, creatoDaNome: u!.nome,
      inCopiaA: copia.map((c) => c.id), categoria: str(fd, "categoria"), orePreviste: ore !== null && Number.isFinite(ore) && ore >= 0 ? ore : null,
    },
  });
  // allegati (file e foto): finiscono nella scheda «File» del task, le foto in WebP leggero
  const allegati = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0 && f.size <= MAX_DOCUMENTO);
  for (const f of allegati) {
    const w = await convertiInWebp({ contenuto: Buffer.from(await f.arrayBuffer()), mime: f.type || "application/octet-stream", nome: f.name });
    await prisma.documento.create({ data: { entita: "TASK", entitaId: creato.id, cartella: "Generale", nome: nomeFileSicuro(w.nome), mime: w.mime, dimensione: w.contenuto.length, contenuto: w.contenuto, caricatoDaNome: u!.nome } });
  }
  // avviso via email all'incaricato (se non se lo è dato da solo)
  let avviso = "";
  if (per!.id !== u!.id && per!.email) {
    const quando = scadenza ? ` entro il ${scadenza.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long" })}` : "";
    const link = `${APP_URL}/task/${creato.id}`;
    const esito = await inviaMail({
      a: [per!.email],
      oggetto: `[CRM P&C] Nuovo task da ${u!.nome}: ${oggetto}`,
      testo: `Ciao ${per!.nome.split(" ")[0]},\n\n${u!.nome} ti ha dato un task sul cliente ${cliente!.nome}${quando}:\n\n${oggetto}${descrizione ? `\n\n${descrizione}` : ""}${allegati.length ? `\n\n📎 Allegati: ${allegati.length}` : ""}\n\nApri il cliente: ${link}\n`,
      daUtenteId: u!.id,
    });
    avviso = esito.inviata ? " (avvisato via email)" : "";
  }
  // chi è in copia viene avvisato
  for (const c of copia) {
    if (c.id !== u!.id && c.email) await inviaMail({ a: [c.email], oggetto: `[CRM P&C] Sei coinvolto in un task: ${oggetto}`, testo: `Ciao ${c.nome.split(" ")[0]},\n\n${u!.nome} ti ha coinvolto in un task per ${per!.nome} sul cliente ${cliente!.nome}:\n\n${oggetto}${descrizione ? `\n\n${descrizione}` : ""}\n\nApri il task: ${APP_URL}/task/${creato.id}`, daUtenteId: u!.id });
  }
  revalidatePath(`/clienti/${cliente!.id}`);
  revalidatePath("/task");
  // dalla pagina dei task si apre subito il task nuovo, dalla scheda cliente si torna alla scheda
  if (str(fd, "apri") === "1") redirect(`/task/${creato.id}?tab=descrizione&ok=${encodeURIComponent(`Task dato a ${per!.id === u!.id ? "te" : per!.nome}${avviso}`)}`);
  const anche = copia.length ? ` (coinvolti anche: ${copia.map((c) => c.nome).join(", ")})` : "";
  vai(torna, { fatto: `Task dato a ${per!.id === u!.id ? "te" : per!.nome}${avviso}${anche}` });
}

/** «✓ Fatto» su un task del cliente: dalla scheda cliente o da «Task». */
export async function completaTaskCliente(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = str(fd, "id");
  if (!id) return;
  const t = await prisma.attivita.findUnique({ where: { id }, select: { clienteId: true } });
  if (!t) return;
  await prisma.attivita.update({ where: { id }, data: { completata: true, completataIl: new Date(), statoTask: "FATTO" } });
  revalidatePath(`/clienti/${t.clienteId}`);
  revalidatePath("/task");
  revalidatePath("/");
}
