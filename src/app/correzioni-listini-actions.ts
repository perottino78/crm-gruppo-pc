"use server";

// Correzione di refusi nei listini (Debora 23/11/2026): nome e note degli optional e nome delle varianti/colori.
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { svuotaCacheListino } from "@/lib/listini/cache";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };

async function permesso() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "listini.modifica")) throw new Error("Non hai il permesso di modificare i listini.");
  return u;
}
function torna(q: string | null, msg: string, errore = false): never {
  svuotaCacheListino();
  revalidatePath("/prodotti");
  redirect(`/prodotti/correzioni?${q ? `q=${encodeURIComponent(q)}&` : ""}${errore ? "errore" : "ok"}=${encodeURIComponent(msg)}`);
}

/** Corregge nome, categoria e note di un optional (i prezzi non si toccano). */
export async function correggiOptional(fd: FormData) {
  await permesso();
  const id = str(fd, "id"), q = str(fd, "q"), nome = str(fd, "nome");
  if (!id || !nome) torna(q, "Il nome non può restare vuoto.", true);
  await prisma.optional.update({ where: { id: id! }, data: { nome: nome!, note: str(fd, "note") } });
  torna(q, "Optional corretto.");
}

/** Rinomina un colore/variante di un modello (tutte le misure di quel modello nel marchio). */
export async function correggiVariante(fd: FormData) {
  await permesso();
  const brandId = str(fd, "brandId"), tipologia = str(fd, "tipologia"), colore = str(fd, "colore"), nuovo = str(fd, "nuovo"), q = str(fd, "q");
  if (!brandId || !tipologia || !colore || !nuovo) torna(q, "Scrivi il nome corretto.", true);
  try {
    const r = await prisma.prodotto.updateMany({ where: { brandId: brandId!, tipologia: tipologia!, colore: colore! }, data: { colore: nuovo! } });
    torna(q, `Corretto in ${r.count} righe del listino.`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    torna(q, "Esiste già una variante con quel nome in questo modello: non posso unirle da qui.", true);
  }
}
