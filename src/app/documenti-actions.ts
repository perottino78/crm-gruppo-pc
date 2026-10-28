"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { puoVedereEntita } from "@/lib/documenti/server";
import { ENTITA_DOCUMENTI, MAX_DOCUMENTO, nomeFileSicuro } from "@/lib/ordini/calcoli";

export type EsitoDocumenti = { ok: boolean; messaggio: string };

const percorso = (entita: string, id: string) =>
  ({ CLIENTE: `/clienti/${id}`, PREVENTIVO: `/preventivi/${id}`, COMMESSA: `/commesse/${id}`, ORDINE_FORNITORE: `/ordini-fornitori/${id}`, ARTICOLO: `/prodotti/articoli/${id}` })[entita];

const TIPI_AMMESSI = /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif)|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-excel|zip|x-zip-compressed|octet-stream)|message\/rfc822)$/;

export async function caricaDocumenti(_: EsitoDocumenti | null, fd: FormData): Promise<EsitoDocumenti> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, messaggio: "Sessione scaduta: accedi di nuovo." };
  const entita = String(fd.get("entita") ?? ""), entitaId = String(fd.get("entitaId") ?? "");
  if (!ENTITA_DOCUMENTI.includes(entita) || !entitaId) return { ok: false, messaggio: "Richiesta non valida." };
  if (!(await puoVedereEntita(u, entita, entitaId))) return { ok: false, messaggio: "Non autorizzato." };
  const cartella = (String(fd.get("nuovaCartella") ?? "").trim() || String(fd.get("cartella") ?? "").trim() || "Generale").slice(0, 60);
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, messaggio: "Scegli almeno un file." };
  const scartati: string[] = [];
  let caricati = 0;
  for (const f of files) {
    const mime = f.type || "application/octet-stream";
    if (f.size > MAX_DOCUMENTO) { scartati.push(`${f.name} (oltre 4 MB)`); continue; }
    if (!TIPI_AMMESSI.test(mime)) { scartati.push(`${f.name} (tipo non ammesso)`); continue; }
    await prisma.documento.create({ data: { entita, entitaId, cartella, nome: nomeFileSicuro(f.name), mime, dimensione: f.size, contenuto: Buffer.from(await f.arrayBuffer()), caricatoDaNome: u.nome } });
    caricati++;
  }
  const p = percorso(entita, entitaId);
  if (p) revalidatePath(p);
  const msg = `${caricati} file caricati in «${cartella}».` + (scartati.length ? ` Non caricati: ${scartati.join(", ")}.` : "");
  return { ok: caricati > 0, messaggio: msg };
}

export async function eliminaDocumento(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) return;
  const d = await prisma.documento.findUnique({ where: { id: String(fd.get("id") ?? "") }, select: { id: true, entita: true, entitaId: true, caricatoDaNome: true } });
  if (!d) return;
  // può eliminare chi l'ha caricato oppure un amministratore
  if (u.ruolo !== "AMMINISTRATORE" && d.caricatoDaNome !== u.nome) return;
  if (!(await puoVedereEntita(u, d.entita, d.entitaId))) return;
  await prisma.documento.delete({ where: { id: d.id } });
  const p = percorso(d.entita, d.entitaId);
  if (p) revalidatePath(p);
}

export async function spostaDocumento(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) return;
  const d = await prisma.documento.findUnique({ where: { id: String(fd.get("id") ?? "") }, select: { id: true, entita: true, entitaId: true } });
  const cartella = String(fd.get("cartella") ?? "").trim().slice(0, 60);
  if (!d || !cartella || !(await puoVedereEntita(u, d.entita, d.entitaId))) return;
  await prisma.documento.update({ where: { id: d.id }, data: { cartella } });
  const p = percorso(d.entita, d.entitaId);
  if (p) revalidatePath(p);
}
