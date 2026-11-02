"use server";

// Impostazioni › Ruoli e permessi e Zone commerciali (solo amministratore).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { TUTTI_PERMESSI } from "@/lib/permessi/catalogo";
import { assegnaProfilo, propagaProfilo, ricalcolaVisibilita, pulisciPermessi } from "@/lib/permessi/server";
import { REGIONI, siglaProvincia } from "@/lib/zone/regioni";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const PAG_RUOLI = "/impostazioni/ruoli", PAG_ZONE = "/impostazioni/zone";

async function amministratore(pagina: string) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.ruolo !== "AMMINISTRATORE") redirect(`${pagina}?errore=${encodeURIComponent("Solo l'amministratore può cambiare ruoli, permessi e zone.")}`);
  return u;
}
const torna = (pagina: string, p: Record<string, string>, ancora?: string) => redirect(`${pagina}?${new URLSearchParams(p)}${ancora ? `#${ancora}` : ""}`);
const aggiorna = () => { revalidatePath(PAG_RUOLI); revalidatePath(PAG_ZONE); revalidatePath("/impostazioni"); revalidatePath("/", "layout"); };

/** Crea o modifica un profilo: nome, descrizione, visibilità dei dati e permessi a spunta. */
export async function salvaProfilo(fd: FormData) {
  await amministratore(PAG_RUOLI);
  const id = str(fd, "id"), nome = str(fd, "nome");
  if (!nome) torna(PAG_RUOLI, { errore: "Dai un nome al profilo." });
  const vis = str(fd, "visibilita");
  const visibilita = vis === "TUTTI" || vis === "ZONA" ? vis : "PROPRI";
  const permessi = pulisciPermessi(TUTTI_PERMESSI.filter((p) => fd.get(`p:${p}`) === "on"));
  const copiaDa = str(fd, "copiaDa");
  const base = copiaDa ? await prisma.profiloAccesso.findUnique({ where: { id: copiaDa } }) : null;
  const dati = { nome: nome!.slice(0, 80), descrizione: str(fd, "descrizione")?.slice(0, 300) ?? null, visibilita: base?.visibilita ?? visibilita, permessi: base ? base.permessi : permessi };
  const p = id
    ? await prisma.profiloAccesso.update({ where: { id }, data: { ...dati, visibilita, permessi } })
    : await prisma.profiloAccesso.create({ data: { ...dati, ordine: (await prisma.profiloAccesso.count()) } });
  const n = await propagaProfilo(p.id);
  await ricalcolaVisibilita();
  aggiorna();
  torna(PAG_RUOLI, { ok: `Profilo «${p.nome}» salvato${n ? `: aggiornati ${n} ${n === 1 ? "collega" : "colleghi"}` : ""}.`, aperto: p.id, salvato: p.id }, `profilo-${p.id}`);
}

/** Elimina un profilo: chi lo aveva torna ai permessi predefiniti del suo ruolo. */
export async function eliminaProfilo(fd: FormData) {
  await amministratore(PAG_RUOLI);
  const id = str(fd, "id");
  if (!id) return;
  const p = await prisma.profiloAccesso.findUnique({ where: { id } });
  if (!p) return;
  const chi = await prisma.utente.findMany({ where: { profiloId: id }, select: { id: true } });
  for (const u of chi) await assegnaProfilo(u.id, null);
  await prisma.profiloAccesso.delete({ where: { id } });
  await ricalcolaVisibilita();
  aggiorna();
  torna(PAG_RUOLI, { ok: `Profilo «${p.nome}» eliminato${chi.length ? `: ${chi.length} ${chi.length === 1 ? "collega torna" : "colleghi tornano"} ai permessi del ruolo` : ""}.` });
}

/** Profilo, zona e responsabilità d'ufficio di una persona. */
export async function assegnaAccesso(fd: FormData) {
  const admin = await amministratore(PAG_RUOLI);
  const utenteId = str(fd, "utenteId");
  if (!utenteId) return;
  const u = await prisma.utente.findUniqueOrThrow({ where: { id: utenteId } });
  const profiloId = str(fd, "profiloId");
  if (utenteId === admin.id && u.ruolo === "AMMINISTRATORE" && profiloId) torna(PAG_RUOLI, { errore: "L'amministratore vede sempre tutto: non serve un profilo." });
  await assegnaProfilo(utenteId, profiloId);
  await prisma.utente.update({ where: { id: utenteId }, data: { zonaId: str(fd, "zonaId"), responsabileUfficio: fd.get("responsabileUfficio") === "on" } });
  await ricalcolaVisibilita();
  aggiorna();
  torna(PAG_RUOLI, { ok: `${u.nome}: accesso aggiornato.`, salvato: utenteId }, `persona-${utenteId}`);
}

/** Crea o modifica una zona commerciale: regioni a spunta, province in più, responsabile di zona. */
export async function salvaZona(fd: FormData) {
  await amministratore(PAG_ZONE);
  const id = str(fd, "id"), nome = str(fd, "nome");
  if (!nome) torna(PAG_ZONE, { errore: "Dai un nome alla zona." });
  let regioni = Object.keys(REGIONI).filter((r) => fd.get(`r:${r}`) === "on");
  // zona nuova con il nome di una regione ("Emilia-Romagna"): la regione si spunta da sola
  if (!id && !regioni.length) regioni = Object.keys(REGIONI).filter((r) => r.toLowerCase() === nome!.toLowerCase());
  const provinceExtra = [...new Set((str(fd, "provinceExtra") ?? "").split(/[,;\s]+/).map(siglaProvincia).filter((x): x is string => !!x))];
  const dati = { nome: nome!.slice(0, 80), regioni, provinceExtra, responsabileId: str(fd, "responsabileId"), attiva: fd.get("attiva") !== "off" };
  const z = id ? await prisma.zonaCommerciale.update({ where: { id }, data: dati }) : await prisma.zonaCommerciale.create({ data: { ...dati, ordine: await prisma.zonaCommerciale.count() } });
  // il team della zona, spuntato nello stesso riquadro (il responsabile ne fa sempre parte)
  if (id && fd.get("conTeam") === "1") {
    const membri = new Set(fd.getAll("membri").filter((x): x is string => typeof x === "string"));
    if (z.responsabileId) membri.add(z.responsabileId);
    await prisma.utente.updateMany({ where: { zonaId: z.id, id: { notIn: [...membri] } }, data: { zonaId: null } });
    if (membri.size) await prisma.utente.updateMany({ where: { id: { in: [...membri] } }, data: { zonaId: z.id } });
  } else if (z.responsabileId) await prisma.utente.update({ where: { id: z.responsabileId }, data: { zonaId: z.id } });
  await ricalcolaVisibilita();
  aggiorna();
  torna(PAG_ZONE, { ok: `Zona «${z.nome}» salvata${!regioni.length && !provinceExtra.length ? " (senza regioni: aggiungine almeno una)" : ""}.`, salvato: z.id }, `zona-${z.id}`);
}

export async function eliminaZona(fd: FormData) {
  await amministratore(PAG_ZONE);
  const id = str(fd, "id");
  if (!id) return;
  const z = await prisma.zonaCommerciale.findUnique({ where: { id } });
  if (!z) return;
  await prisma.utente.updateMany({ where: { zonaId: id }, data: { zonaId: null } });
  await prisma.zonaCommerciale.delete({ where: { id } });
  await ricalcolaVisibilita();
  aggiorna();
  torna(PAG_ZONE, { ok: `Zona «${z.nome}» eliminata.` });
}
