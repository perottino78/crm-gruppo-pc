"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { daOraRoma } from "@/lib/calendario/tempo";
import { scopeLeadWhere } from "@/lib/scope";
import { registraEsito, assegnaVenditore, eseguiDopoRisposta, eseguiInviiScaduti, CHIAVE_ATTIVE } from "@/lib/automazioni/motore";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const torna = (ritorno: string | null, parametri: Record<string, string>) => {
  const base = ritorno?.startsWith("/lead") ? ritorno : "/lead";
  const u = new URL(base, "http://x");
  for (const [k, v] of Object.entries(parametri)) u.searchParams.set(k, v);
  return `${u.pathname}${u.search}`;
};

/** Esito della telefonata o della classificazione: aggiorna il lead e fa partire il percorso automatico. */
export async function esitoLead(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const leadId = str(fd, "leadId");
  const esito = str(fd, "esito");
  const ritorno = str(fd, "ritorno");
  if (!leadId || !esito) redirect(torna(ritorno, { errore: "Scegli un esito." }));
  // solo chi vede il lead può registrarne l'esito
  const visibile = await prisma.lead.count({ where: { AND: [{ id: leadId }, scopeLeadWhere(u)] } });
  if (!visibile) redirect(torna(ritorno, { errore: "Lead non trovato." }));
  const r = await registraEsito({ leadId, esito, data: daOraRoma(str(fd, "data")), note: str(fd, "note"), utenteNome: u.nome, venditoreId: str(fd, "venditoreId"), indirizzo: str(fd, "indirizzo") });
  if (!r.ok) redirect(torna(ritorno, { errore: r.errore, id: leadId }));
  eseguiDopoRisposta();
  revalidatePath("/lead");
  revalidatePath("/clienti");
  revalidatePath("/");
  redirect(torna(ritorno, { fatto: leadId }));
}

/** Il centralino sceglie (o cambia) il venditore dell'appuntamento: partono conferme, lettere e promemoria. */
export async function assegnaVenditoreLead(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const leadId = str(fd, "leadId");
  const venditoreId = str(fd, "venditoreId");
  const ritorno = str(fd, "ritorno");
  if (!leadId || !venditoreId) redirect(torna(ritorno, { errore: "Scegli il venditore." }));
  const visibile = await prisma.lead.count({ where: { AND: [{ id: leadId }, scopeLeadWhere(u)] } });
  if (!visibile) redirect(torna(ritorno, { errore: "Lead non trovato." }));
  const r = await assegnaVenditore(leadId, venditoreId, u.nome);
  if (!r.ok) redirect(torna(ritorno, { errore: r.errore, id: leadId }));
  eseguiDopoRisposta();
  revalidatePath("/lead");
  revalidatePath("/calendario");
  redirect(torna(ritorno, { fatto: leadId }));
}

async function amministratore() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.ruolo !== "AMMINISTRATORE") redirect("/impostazioni/automazioni?errore=permesso");
  return u;
}

/** Accende o mette in pausa le email automatiche dei lead (finché Keap è attivo devono restare in pausa). */
export async function impostaAutomazioni(fd: FormData) {
  await amministratore();
  const attive = fd.get("attive") === "1";
  await prisma.configurazione.upsert({ where: { chiave: CHIAVE_ATTIVE }, update: { valore: attive ? "1" : "0" }, create: { chiave: CHIAVE_ATTIVE, valore: attive ? "1" : "0" } });
  revalidatePath("/impostazioni/automazioni");
  redirect(`/impostazioni/automazioni?ok=${attive ? "attive" : "pausa"}`);
}

/** Esegue subito gli invii scaduti (senza aspettare il controllo periodico). */
export async function eseguiOra() {
  await amministratore();
  const r = await eseguiInviiScaduti();
  revalidatePath("/impostazioni/automazioni");
  redirect(`/impostazioni/automazioni?eseguiti=${r.eseguiti}&inviate=${r.email}${r.motivo ? `&motivo=${encodeURIComponent(r.motivo)}` : ""}`);
}
