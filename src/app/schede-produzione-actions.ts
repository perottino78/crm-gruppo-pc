"use server";

// Schede di produzione in HTML per il fornitore: modelli (editor) e compilazione sull'ordine con le misure definitive.
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puoGestireOrdini } from "@/lib/ordini/server";
import { numeroOrdine } from "@/lib/ordini/calcoli";
import { campiDaCompilare, compilaScheda, tabellaRighe } from "@/lib/ordini/scheda-produzione";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };

async function addetto() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puoGestireOrdini(u)) throw new Error("Non autorizzato.");
  return u;
}

export async function salvaModelloScheda(fd: FormData) {
  const u = await addetto();
  const id = str(fd, "id"), nome = str(fd, "nome"), html = typeof fd.get("html") === "string" ? (fd.get("html") as string) : "";
  if (!nome || !html.trim()) redirect(`/ordini-fornitori/schede?errore=${encodeURIComponent("Servono il nome e il testo HTML.")}${id ? `&modifica=${id}` : "&nuovo=1"}`);
  const dati = { nome, html, fornitoreId: str(fd, "fornitoreId"), attivo: fd.get("attivo") !== "0" };
  const m = id ? await prisma.schedaProduzioneModello.update({ where: { id }, data: dati }) : await prisma.schedaProduzioneModello.create({ data: { ...dati, creatoDaNome: u.nome } });
  revalidatePath("/ordini-fornitori/schede");
  redirect(`/ordini-fornitori/schede?salvato=${m.id}`);
}

export async function eliminaModelloScheda(fd: FormData) {
  await addetto();
  const id = str(fd, "id");
  if (id) await prisma.schedaProduzioneModello.deleteMany({ where: { id } });
  revalidatePath("/ordini-fornitori/schede");
  redirect("/ordini-fornitori/schede?eliminato=1");
}

/** Compila il modello con i dati dell'ordine e le misure inserite, e lo salva tra i documenti della pratica («Schede produzione»): si allega poi all'invio dell'ordine. */
export async function creaSchedaProduzione(fd: FormData) {
  const u = await addetto();
  const ordineId = str(fd, "ordineId"), modelloId = str(fd, "modelloId");
  if (!ordineId || !modelloId) return;
  const [o, m] = await Promise.all([
    prisma.ordineFornitore.findUnique({ where: { id: ordineId }, include: { fornitore: true, commessa: { include: { cliente: true } }, righe: { orderBy: { createdAt: "asc" } } } }),
    prisma.schedaProduzioneModello.findUnique({ where: { id: modelloId } }),
  ]);
  if (!o || !m) return;
  const rilievi = o.commessaId ? await prisma.rilievo.findMany({ where: { commessaId: o.commessaId, misure: { not: null } }, orderBy: { dataOra: "asc" }, select: { misure: true } }) : [];
  const valori: Record<string, string> = {
    ordine: numeroOrdine(o), data: o.dataOrdine.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }), fornitore: o.fornitore.ragioneSociale,
    cliente: o.clienteFinale ?? o.commessa?.cliente.nome ?? "", commessa: o.commessa ? `${o.commessa.numero}/${o.commessa.anno}` : "",
    indirizzo: o.indirizzoSpedizione ?? "", consegna: o.consegnaRichiesta ? o.consegnaRichiesta.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "",
    misure_rilievo: rilievi.map((r) => r.misure).join("\n\n"),
  };
  for (const c of campiDaCompilare(m.html)) valori[c] = typeof fd.get(`campo_${c}`) === "string" ? (fd.get(`campo_${c}`) as string) : "";
  const html = compilaScheda(m.html, valori, tabellaRighe(o.righe.map((r) => ({ descrizione: r.descrizione, quantita: r.quantita, um: r.um, codice: r.codiceFornitore ?? r.codice, note: r.note }))));
  const contenuto = Buffer.from(html, "utf-8");
  const nome = `Scheda produzione ${numeroOrdine(o).replace("/", "-")} ${o.fornitore.ragioneSociale}.html`.replace(/[^\w.\- ]+/g, "_");
  await prisma.documento.create({
    data: o.commessaId
      ? { entita: "COMMESSA", entitaId: o.commessaId, cartella: "Schede produzione", nome, mime: "text/html", dimensione: contenuto.length, contenuto, caricatoDaNome: u.nome }
      : { entita: "ORDINE_FORNITORE", entitaId: o.id, cartella: "Generale", nome, mime: "text/html", dimensione: contenuto.length, contenuto, caricatoDaNome: u.nome },
  });
  revalidatePath(`/ordini-fornitori/${o.id}`);
  redirect(`/ordini-fornitori/${o.id}?ok=${encodeURIComponent("Scheda di produzione creata: la trovi tra i documenti da allegare all'invio dell'ordine (cartella «Schede produzione»).")}#scheda-produzione`);
}
