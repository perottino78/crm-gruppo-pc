"use server";

// Spesa di marketing per mese e canale (Marketing › Costo per canale).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoMarketing } from "@/lib/utenti/stato";
import { leggiQuantita } from "@/lib/magazzino/calcoli";
import { meseValido } from "@/lib/marketing/costi";
import { provenienzaDaFonte } from "@/lib/clienti/provenienza";

export async function salvaSpeseMarketing(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puoMarketing(u)) throw new Error("Area del marketing.");
  const mese = String(fd.get("mese") ?? "");
  if (!meseValido(mese)) redirect("/marketing/costi?errore=" + encodeURIComponent("Mese non valido."));
  const voci: [string, number | null][] = [];
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string" && k.startsWith("spesa_")) voci.push([k.slice(6), leggiQuantita(v.trim() || null)]);
  }
  const nuovo = String(fd.get("nuovo_canale") ?? "").trim();
  if (nuovo) voci.push([provenienzaDaFonte(nuovo), leggiQuantita(String(fd.get("nuovo_importo") ?? "").trim() || null)]);
  for (const [canale, importo] of voci) {
    if (importo === null || importo === 0) await prisma.spesaMarketing.deleteMany({ where: { mese, canale } });
    else await prisma.spesaMarketing.upsert({ where: { mese_canale: { mese, canale } }, create: { mese, canale, importo: Math.max(0, importo), inseritaDa: u.nome }, update: { importo: Math.max(0, importo), inseritaDa: u.nome } });
  }
  revalidatePath("/marketing/costi");
  redirect(`/marketing/costi?mese=${mese}&salvato=1`);
}
