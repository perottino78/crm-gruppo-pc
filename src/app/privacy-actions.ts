"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { setConfig } from "@/lib/leadIngest";
import { prisma } from "@/lib/prisma";
import { CHIAVE_INFORMATIVA, CHIAVE_INFORMATIVA_DATA } from "@/lib/privacy/informativa";
import { registraConsenso } from "@/lib/privacy/consensi";
import { registra as registraLog } from "@/lib/amministrazione/server";

async function utente() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** Salva il testo dell'informativa pubblica (/privacy). Testo vuoto = torna quello di partenza. */
export async function salvaInformativa(fd: FormData) {
  const u = await utente();
  if (!(puo(u, "marketing") || puo(u, "firme"))) redirect("/impostazioni?errore=permesso");
  const testo = String(fd.get("testo") ?? "").trim().slice(0, 30000);
  const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  await setConfig(CHIAVE_INFORMATIVA, testo);
  await setConfig(CHIAVE_INFORMATIVA_DATA, testo ? oggi : "");
  await registraLog("PRIVACY", null, testo ? "INFORMATIVA_MODIFICATA" : "INFORMATIVA_RIPRISTINATA", testo ? `Informativa privacy aggiornata (versione ${oggi})` : "Informativa privacy riportata al testo di partenza", u.nome);
  revalidatePath("/privacy");
  redirect("/impostazioni/privacy?salvato=1");
}

/** Dalla scheda cliente: chi lavora con il cliente registra il suo consenso (o la revoca) dato in altro modo, con la fonte. */
export async function registraConsensoCliente(fd: FormData) {
  const u = await utente();
  const clienteId = String(fd.get("clienteId") ?? "");
  if (!clienteId || !puo(u, "clienti")) redirect("/clienti");
  const stato = fd.get("stato") === "REVOCATO" ? "REVOCATO" : "CONCESSO";
  const fonti = ["CONTRATTO", "MODULO_CARTACEO", "A_VOCE", "MANUALE"];
  const fonte = fonti.includes(String(fd.get("fonte"))) ? String(fd.get("fonte")) : "MANUALE";
  const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true, email: true } });
  if (!c) redirect("/clienti");
  await registraConsenso({ clienteId: c.id, email: c.email, stato, fonte: stato === "REVOCATO" ? "MANUALE" : fonte, utenteNome: u.nome, testo: stato === "REVOCATO" ? String(fd.get("nota") ?? "").slice(0, 300) || null : undefined });
  revalidatePath(`/clienti/${c.id}`);
  redirect(`/clienti/${c.id}?sez=amministrazione&consenso=1`);
}
