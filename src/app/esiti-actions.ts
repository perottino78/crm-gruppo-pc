"use server";
// Regole sull'esito degli appuntamenti (Impostazioni › Lead, solo chi ha il permesso «lead.esiti»: l'amministratore).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { CHIAVI_ESITI } from "@/lib/appuntamenti/esiti";
import { regoleEsiti } from "@/lib/appuntamenti/esiti-server";

const PAGINA = "/impostazioni/lead";
const vai = (q: { ok?: string; errore?: string }): never => redirect(`${PAGINA}?${new URLSearchParams(q as Record<string, string>)}#esiti`);
const scrivi = (chiave: string, valore: string) => prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });

async function chi() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "lead.esiti")) vai({ errore: "Solo l'amministratore cambia le regole sull'esito degli appuntamenti" });
  return u;
}

export async function salvaRegoleEsiti(fd: FormData) {
  await chi();
  const n = (k: string, min: number, max: number) => { const v = Math.round(Number(fd.get(k))); return Number.isFinite(v) ? String(Math.min(max, Math.max(min, v))) : null; };
  const promemoria = n("giorniPromemoria", 1, 30), lista = n("giorniLista", 1, 60), soglia = n("sogliaBlocco", 1, 50);
  if (!promemoria || !lista || !soglia) vai({ errore: "Scrivi dei numeri di giorni validi" });
  if (Number(lista) < Number(promemoria)) vai({ errore: "La lista del centralino non può arrivare prima del promemoria al commerciale" });
  const dal = String(fd.get("dal") ?? "");
  await scrivi(CHIAVI_ESITI.promemoria, promemoria!);
  await scrivi(CHIAVI_ESITI.lista, lista!);
  await scrivi(CHIAVI_ESITI.soglia, soglia!);
  await scrivi(CHIAVI_ESITI.blocco, fd.get("bloccoAttivo") ? "1" : "0");
  if (/^\d{4}-\d{2}-\d{2}$/.test(dal)) await scrivi(CHIAVI_ESITI.dal, dal);
  revalidatePath(PAGINA);
  vai({ ok: "Regole sull'esito degli appuntamenti salvate." });
}

/** Sblocca (o riblocca) una persona; «tutti» sblocca chi è bloccato adesso. */
export async function sbloccaEsiti(fd: FormData) {
  await chi();
  const r = await regoleEsiti();
  const id = String(fd.get("utenteId") ?? "");
  const azione = String(fd.get("azione") ?? "sblocca");
  let sbloccati = new Set(r.sbloccati);
  if (azione === "tutti") sbloccati = new Set([...sbloccati, ...String(fd.get("ids") ?? "").split(",").filter(Boolean)]);
  else if (azione === "riblocca") sbloccati.delete(id);
  else if (id) sbloccati.add(id);
  await scrivi(CHIAVI_ESITI.sbloccati, JSON.stringify([...sbloccati]));
  revalidatePath(PAGINA);
  vai({ ok: azione === "riblocca" ? "Il blocco vale di nuovo per questa persona." : "Sbloccato: può ricevere nuovi appuntamenti." });
}
