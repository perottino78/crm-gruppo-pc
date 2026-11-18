"use server";

// Voci dei servizi (Posa, Trasporto, Assistenza tecnica, ENEA…) modificabili dal listino: nome e prezzo valgono per tutti i marchi.
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { PREFISSO_SERVIZI } from "@/lib/provvigioni/servizi";
import { svuotaCacheListino } from "@/lib/listini/cache";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const prezzo = (fd: FormData) => { const v = str(fd, "prezzo"); if (v === null) return null; const n = parseFloat(v.replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : null; };

async function permesso() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "listini.modifica")) throw new Error("Non hai il permesso di modificare i listini.");
}
function esito(tipologia: string, messaggio: string, errore = false): never {
  revalidatePath("/prodotti");
  svuotaCacheListino();
  revalidatePath(`/prodotti/modello/${encodeURIComponent(tipologia)}`);
  redirect(`/prodotti/modello/${encodeURIComponent(tipologia)}?${errore ? "kitErrore" : "kitOk"}=${encodeURIComponent(messaggio)}#voci`);
}

/** Cambia nome e prezzo di una voce (in tutti i marchi). */
export async function salvaVoceServizio(fd: FormData) {
  await permesso();
  const tipologia = str(fd, "tipologia"), vecchio = str(fd, "nomeOriginale"), nome = str(fd, "nome"), p = prezzo(fd);
  if (!tipologia || !tipologia.startsWith(PREFISSO_SERVIZI) || !vecchio || !nome) return;
  if (p === null) esito(tipologia, "Il prezzo non è valido.", true);
  if (nome !== vecchio && (await prisma.prodotto.count({ where: { tipologia, colore: nome } }))) esito(tipologia, `Esiste già una voce «${nome}».`, true);
  await prisma.prodotto.updateMany({ where: { tipologia, colore: vecchio }, data: { colore: nome, prezzoBase: p } });
  esito(tipologia, `Voce «${nome}» salvata.`);
}

/** Aggiunge una voce al servizio, per tutti i marchi che lo hanno. */
export async function aggiungiVoceServizio(fd: FormData) {
  await permesso();
  const tipologia = str(fd, "tipologia"), nome = str(fd, "nome"), p = prezzo(fd) ?? 0;
  if (!tipologia || !tipologia.startsWith(PREFISSO_SERVIZI) || !nome) return;
  const marchi = (await prisma.prodotto.findMany({ where: { tipologia }, distinct: ["brandId"], select: { brandId: true } })).map((m) => m.brandId);
  if (await prisma.prodotto.count({ where: { tipologia, colore: nome } })) esito(tipologia, `Esiste già una voce «${nome}».`, true);
  for (const brandId of marchi) await prisma.prodotto.create({ data: { brandId, tipologia, colore: nome, larghezzaMm: 0, altezzaMm: 0, prezzoBase: p, coefficienteRicarico: 1 } });
  esito(tipologia, `Voce «${nome}» aggiunta.`);
}

/** Toglie una voce; se è già usata in un'offerta resta (si può solo rinominare). */
export async function eliminaVoceServizio(fd: FormData) {
  await permesso();
  const tipologia = str(fd, "tipologia"), nome = str(fd, "nomeOriginale");
  if (!tipologia || !tipologia.startsWith(PREFISSO_SERVIZI) || !nome) return;
  const righe = await prisma.prodotto.findMany({ where: { tipologia, colore: nome }, select: { id: true } });
  let tolte = 0, usate = 0;
  for (const r of righe) { try { await prisma.prodotto.delete({ where: { id: r.id } }); tolte++; } catch { usate++; } }
  if (usate) esito(tipologia, `La voce «${nome}» è già usata in offerte e non si può togliere: puoi rinominarla.`, true);
  esito(tipologia, `Voce «${nome}» tolta (${tolte} righe).`);
}
