"use server";

import { puoMarketing } from "@/lib/utenti/stato";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Utente } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { daOraRoma } from "@/lib/calendario/tempo";
import { accodaCampagna, inviaProva, CHIAVE_PROMEMORIA_GIORNI, CHIAVE_PROMEMORIA_A } from "@/lib/campagne/motore";
import { eseguiDopoRisposta } from "@/lib/automazioni/motore";
import { emailValida, leggiGiorniPromemoria, giorniAllaScadenza } from "@/lib/campagne/regole";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const lista = (fd: FormData, k: string) => fd.getAll(k).filter((x): x is string => typeof x === "string" && !!x.trim());

/** Le campagne le fanno l'amministratore e l'ufficio Marketing. */
export const puoFareCampagne = async (u: Pick<Utente, "ruolo" | "ufficio"> | null) => !!u && (u.ruolo === "AMMINISTRATORE" || u.ruolo === "MARKETING" || u.ufficio === "MARKETING");

async function marketing() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!(await puoFareCampagne(u))) redirect("/campagne?errore=permesso");
  return u;
}
const torna = (id: string, p: Record<string, string>) => redirect(`/campagne/${id}?${new URLSearchParams(p)}`);

export async function creaCampagna(fd: FormData) {
  const u = await marketing();
  const c = await prisma.campagna.create({ data: { nome: str(fd, "nome") ?? "Nuova campagna", creataDa: u.nome } });
  redirect(`/campagne/${c.id}`);
}

export async function salvaCampagna(fd: FormData) {
  await marketing();
  const id = str(fd, "id");
  if (!id) return;
  const fino = str(fd, "validaFino");
  await prisma.campagna.update({
    where: { id },
    data: {
      nome: str(fd, "nome") ?? "Campagna", oggetto: (str(fd, "oggetto") ?? "").slice(0, 200), testo: (str(fd, "testo") ?? "").slice(0, 8000),
      marchi: lista(fd, "marchi"), stati: lista(fd, "stati"), categorie: lista(fd, "categorie"),
      provenienza: str(fd, "provenienza"), commercialeId: str(fd, "commercialeId"), provincia: str(fd, "provincia"),
      validaFino: fino ? daOraRoma(`${fino}T12:00`) : null,
      // nuova scadenza: gli avvisi ripartono da capo
      promemoriaInviati: [],
    },
  });
  revalidatePath("/campagne");
  torna(id, { ok: "Campagna salvata." });
}

export async function provaCampagna(fd: FormData) {
  const u = await marketing();
  const id = str(fd, "id");
  if (!id) return;
  const a = str(fd, "a") ?? u.email;
  if (!emailValida(a)) torna(id, { errore: "Scrivi un indirizzo email valido per la prova." });
  const r = await inviaProva(id, a);
  torna(id, r.inviata ? { ok: `Email di prova inviata a ${a}.` } : { errore: `Email di prova non inviata: ${r.motivo ?? "errore"}` });
}

export async function inviaCampagna(fd: FormData) {
  await marketing();
  const id = str(fd, "id");
  if (!id) return;
  const c = await prisma.campagna.findUniqueOrThrow({ where: { id } });
  if (!c.oggetto.trim() || !c.testo.trim()) torna(id, { errore: "Scrivi oggetto e testo dell'email e salva prima di inviare." });
  if (c.validaFino && giorniAllaScadenza(c.validaFino, new Date()) < 0) torna(id, { errore: "La campagna è già scaduta: aggiorna la data \"valida fino al\"." });
  const n = await accodaCampagna(id);
  eseguiDopoRisposta();
  revalidatePath("/campagne");
  torna(id, { ok: n ? `Invio avviato: ${n} email in coda, partono a blocchi nei prossimi minuti.` : "Nessun nuovo destinatario: chi rientra nei filtri l'ha già ricevuta." });
}

export async function duplicaCampagna(fd: FormData) {
  const u = await marketing();
  const id = str(fd, "id");
  if (!id) return;
  const c = await prisma.campagna.findUniqueOrThrow({ where: { id } });
  const n = await prisma.campagna.create({
    data: { nome: `${c.nome} (copia)`, oggetto: c.oggetto, testo: c.testo, marchi: c.marchi, stati: c.stati, categorie: c.categorie, provenienza: c.provenienza, commercialeId: c.commercialeId, provincia: c.provincia, creataDa: u.nome },
  });
  redirect(`/campagne/${n.id}?ok=${encodeURIComponent("Copia creata: aggiorna testo e scadenza, poi invia.")}`);
}

export async function eliminaCampagna(fd: FormData) {
  await marketing();
  const id = str(fd, "id");
  if (!id) return;
  await prisma.campagna.deleteMany({ where: { id, stato: "BOZZA" } }); // solo le bozze: le inviate restano nello storico
  revalidatePath("/campagne");
  redirect("/campagne");
}

/** Impostazioni: giorni degli avvisi di scadenza (es. 3,2,1) e a chi mandarli. */
export async function salvaPromemoriaCampagne(fd: FormData) {
  const u = await getCurrentUser();
  if (!u || !puoMarketing(u)) redirect("/impostazioni/automazioni?errore=permesso");
  const giorni = leggiGiorniPromemoria(str(fd, "giorni") ?? "").join(",");
  const a = (str(fd, "a") ?? "").split(/[,;\s]+/).filter(emailValida).join(", ");
  for (const [chiave, valore] of [[CHIAVE_PROMEMORIA_GIORNI, giorni], [CHIAVE_PROMEMORIA_A, a]] as const)
    await prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });
  revalidatePath("/impostazioni/automazioni");
  redirect("/impostazioni/automazioni?promemoria=1");
}
