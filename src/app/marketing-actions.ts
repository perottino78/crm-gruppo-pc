"use server";

import { puo } from "@/lib/permessi/catalogo";
// Marketing (come in Keap): testi delle email automatiche modificabili dal CRM.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoMarketing } from "@/lib/utenti/stato";
import { MODELLI } from "@/lib/automazioni/email";
import { chiaveTesto, VARIANTI } from "@/lib/automazioni/personalizza";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v : null; };
const PAGINA = "/marketing/email";

async function marketing() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "automazioni")) redirect(`${PAGINA}?errore=${encodeURIComponent("Solo amministrazione e marketing possono modificare le email.")}`);
  return u;
}
function modelloValido(fd: FormData) {
  const modello = str(fd, "modello") ?? "", variante = str(fd, "variante") || null;
  if (!MODELLI[modello] || (variante && !(VARIANTI[modello] ?? []).includes(variante))) redirect(`${PAGINA}?errore=${encodeURIComponent("Email sconosciuta.")}`);
  return { modello, variante, chiave: chiaveTesto(modello, variante) };
}
const torna = (chiave: string, p: Record<string, string>) => redirect(`${PAGINA}?${new URLSearchParams({ ...p, aperta: chiave })}#${encodeURIComponent(chiave)}`);

/** Salva il testo personalizzato di un'email automatica (oggetto e testo con i segnaposto). */
export async function salvaTestoEmail(fd: FormData) {
  const u = await marketing();
  const { chiave } = modelloValido(fd);
  const oggetto = (str(fd, "oggetto") ?? "").trim().slice(0, 300);
  const testo = (str(fd, "testo") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 10000);
  if (!oggetto || !testo) torna(chiave, { errore: "Oggetto e testo non possono essere vuoti." });
  const valore = JSON.stringify({ oggetto, testo, aggiornatoDa: u.nome, aggiornatoIl: new Date().toISOString() });
  await prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });
  revalidatePath(PAGINA);
  torna(chiave, { ok: "Testo salvato: da ora le email partono con questo testo." });
}

/** Torna al testo standard (cancella quello personalizzato). */
export async function ripristinaTestoEmail(fd: FormData) {
  await marketing();
  const { chiave } = modelloValido(fd);
  await prisma.configurazione.deleteMany({ where: { chiave } });
  revalidatePath(PAGINA);
  torna(chiave, { ok: "Ripristinato il testo standard." });
}
