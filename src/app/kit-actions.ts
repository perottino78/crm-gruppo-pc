"use server";

// Distinta base (kit) dei modelli di listino: pezzi da ordinare insieme al prodotto (solo acquisto). Si modifica dalla scheda del modello.
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { CALCOLI_KIT } from "@/lib/listini/kit";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const num = (fd: FormData, k: string) => { const v = str(fd, k); if (v === null) return null; const n = Number(v.replace(/\./g, (m, i, t) => (t.includes(",") ? "" : m)).replace(",", ".")); return Number.isFinite(n) ? n : null; };

async function autorizzato() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "listini.modifica")) throw new Error("Serve il permesso «Caricare listini e articoli».");
  return u;
}
const torna = (tipologia: string, q = "") => redirect(`/prodotti/modello/${encodeURIComponent(tipologia)}${q}#kit`);

export async function aggiungiComponenteKit(fd: FormData) {
  const u = await autorizzato();
  const brandId = str(fd, "brandId"), tipologia = str(fd, "tipologia");
  if (!brandId || !tipologia) return;
  const codice = str(fd, "articolo")?.split(" — ")[0].trim() ?? null;
  const art = codice ? await prisma.articolo.findFirst({ where: { codice: { equals: codice, mode: "insensitive" } } }) : null;
  if (codice && !art) torna(tipologia, `?kitErrore=${encodeURIComponent(`Articolo «${codice}» non trovato: lascia vuoto e scrivi la descrizione.`)}`);
  const descrizione = str(fd, "descrizione") ?? art?.descrizione ?? null;
  if (!descrizione) torna(tipologia, `?kitErrore=${encodeURIComponent("Scrivi la descrizione del pezzo (o scegli un articolo).")}`);
  const quantita = num(fd, "quantita") ?? 1;
  if (quantita <= 0) torna(tipologia, `?kitErrore=${encodeURIComponent("La quantità deve essere maggiore di zero.")}`);
  const calcolo = CALCOLI_KIT.some((c) => c.valore === str(fd, "calcolo")) ? str(fd, "calcolo")! : "PEZZO";
  const ultimo = await prisma.componenteKit.aggregate({ where: { brandId, tipologia }, _max: { ordine: true } });
  await prisma.componenteKit.create({
    data: {
      brandId, tipologia, descrizione: descrizione!, quantita, calcolo, facoltativo: fd.get("facoltativo") === "on",
      articoloId: art?.id ?? null, fornitoreId: str(fd, "fornitoreId") ?? art?.fornitoreId ?? null, costoUnitario: num(fd, "costoUnitario") ?? art?.costoAcquisto ?? null,
      ordine: (ultimo._max.ordine ?? 0) + 1, creatoDaNome: u.nome,
    },
  });
  revalidatePath(`/prodotti/modello/${encodeURIComponent(tipologia)}`);
  torna(tipologia, `?kitOk=${encodeURIComponent(`«${descrizione}» aggiunto alla distinta base.`)}`);
}

export async function eliminaComponenteKit(fd: FormData) {
  await autorizzato();
  const id = str(fd, "id");
  if (!id) return;
  const c = await prisma.componenteKit.findUnique({ where: { id } });
  if (!c) return;
  await prisma.componenteKit.delete({ where: { id } });
  revalidatePath(`/prodotti/modello/${encodeURIComponent(c.tipologia)}`);
  torna(c.tipologia, `?kitOk=${encodeURIComponent(`«${c.descrizione}» tolto dalla distinta base.`)}`);
}
