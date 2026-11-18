"use server";

// Distinta base (kit) e prodotti correlati di un articolo, come nella scheda prodotto di BConsole.
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puoModificareArticoli } from "@/lib/articoli/server";
import { leggiNumero } from "@/lib/articoli/prezzi";
import { creaCiclo, totaliDistinta } from "@/lib/articoli/distinta";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };

async function modificatore() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puoModificareArticoli(u)) throw new Error("Solo amministrazione e marketing possono modificare le schede articolo.");
  return u;
}
const torna = (id: string, messaggio?: string) => {
  revalidatePath(`/prodotti/articoli/${id}`);
  if (messaggio) redirect(`/prodotti/articoli/${id}?distinta=${encodeURIComponent(messaggio)}#distinta`);
};

/** Aggiunge un pezzo al kit (con la quantità). Se c'è già, somma la quantità. */
export async function aggiungiComponente(fd: FormData) {
  await modificatore();
  const articoloId = str(fd, "articoloId"), componenteId = str(fd, "componenteId");
  if (!articoloId || !componenteId) return torna(articoloId ?? "", "Scegli prima l'articolo da aggiungere.");
  const q = leggiNumero(str(fd, "quantita")) ?? 1;
  const tutti = await prisma.componenteArticolo.findMany({ select: { articoloId: true, componenteId: true } });
  if (creaCiclo(articoloId, componenteId, (x) => tutti.filter((t) => t.articoloId === x).map((t) => t.componenteId))) return torna(articoloId, "Un kit non può contenere se stesso.");
  const gia = await prisma.componenteArticolo.findFirst({ where: { articoloId, componenteId } });
  if (gia) await prisma.componenteArticolo.update({ where: { id: gia.id }, data: { quantita: gia.quantita + (q > 0 ? q : 1) } });
  else await prisma.componenteArticolo.create({ data: { articoloId, componenteId, quantita: q > 0 ? q : 1, ordine: tutti.filter((t) => t.articoloId === articoloId).length } });
  torna(articoloId);
}

export async function cambiaQuantitaComponente(fd: FormData) {
  await modificatore();
  const id = str(fd, "id"), articoloId = str(fd, "articoloId");
  const q = leggiNumero(str(fd, "quantita"));
  if (!id || !articoloId || q === null || q <= 0) return;
  await prisma.componenteArticolo.update({ where: { id }, data: { quantita: q } });
  torna(articoloId);
}

export async function togliComponente(fd: FormData) {
  await modificatore();
  const id = str(fd, "id"), articoloId = str(fd, "articoloId");
  if (!id || !articoloId) return;
  await prisma.componenteArticolo.deleteMany({ where: { id } });
  torna(articoloId);
}

/** «Ricalcola prezzi da distinta»: costo e prezzo di vendita del kit = somma dei pezzi (il prezzo resta modificabile a mano dopo). */
export async function ricalcolaDaDistinta(fd: FormData) {
  const u = await modificatore();
  const articoloId = str(fd, "articoloId");
  if (!articoloId) return;
  const pezzi = await prisma.componenteArticolo.findMany({ where: { articoloId }, include: { componente: { select: { costoAcquisto: true, prezzoVendita: true } } } });
  if (!pezzi.length) return torna(articoloId, "Il kit non ha ancora pezzi.");
  const t = totaliDistinta(pezzi.map((p) => ({ quantita: p.quantita, costo: p.componente.costoAcquisto, vendita: p.componente.prezzoVendita })));
  const prima = await prisma.articolo.findUnique({ where: { id: articoloId }, select: { costoAcquisto: true, prezzoVendita: true } });
  await prisma.articolo.update({ where: { id: articoloId }, data: { prezzoListino: null, sconti: null, costoAcquisto: t.costo, metodoPrezzo: "MANUALE", valorePrezzo: null, prezzoVendita: t.vendita, um: "kit", aggiornatoDaNome: u.nome } });
  if (prima?.costoAcquisto !== t.costo || prima?.prezzoVendita !== t.vendita)
    await prisma.storicoPrezzoArticolo.create({ data: { articoloId, prezzoListino: null, costoAcquisto: t.costo, prezzoVendita: t.vendita, origine: "DISTINTA", nota: "ricalcolato dalla distinta base", utenteNome: u.nome } });
  revalidatePath("/prodotti/articoli");
  torna(articoloId, t.senzaCosto || t.senzaPrezzo ? `Ricalcolato. Attenzione: ${t.senzaCosto} pezzi senza costo e ${t.senzaPrezzo} senza prezzo di vendita non sono nel totale.` : "Prezzi ricalcolati dalla distinta.");
}

export async function aggiungiCorrelato(fd: FormData) {
  await modificatore();
  const articoloId = str(fd, "articoloId"), correlatoId = str(fd, "componenteId");
  if (!articoloId || !correlatoId || articoloId === correlatoId) return torna(articoloId ?? "", "Scegli un altro articolo da correlare.");
  const gia = await prisma.articoloCorrelato.findFirst({ where: { OR: [{ articoloId, correlatoId }, { articoloId: correlatoId, correlatoId: articoloId }] } });
  if (!gia) await prisma.articoloCorrelato.create({ data: { articoloId, correlatoId } });
  revalidatePath(`/prodotti/articoli/${correlatoId}`);
  torna(articoloId);
}

export async function togliCorrelato(fd: FormData) {
  await modificatore();
  const id = str(fd, "id"), articoloId = str(fd, "articoloId");
  if (!id || !articoloId) return;
  await prisma.articoloCorrelato.deleteMany({ where: { id } });
  torna(articoloId);
}
