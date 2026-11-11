"use server";

import { puo } from "@/lib/permessi/catalogo";
import { puoMarketing } from "@/lib/utenti/stato";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { daOraRoma } from "@/lib/calendario/tempo";
import { scopeLeadWhere } from "@/lib/scope";
import { registraEsito, assegnaVenditore, eseguiDopoRisposta, eseguiInviiScaduti, CHIAVE_ATTIVE, CHIAVE_MESI_RECUPERO, CHIAVE_PROMO_TESTO, CHIAVE_PROMO_FINO } from "@/lib/automazioni/motore";

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
  const r = await registraEsito({ leadId, esito, data: daOraRoma(str(fd, "data")), note: str(fd, "note"), utenteNome: u.nome, venditoreId: str(fd, "venditoreId"), indirizzo: str(fd, "indirizzo"), senzaEmailCliente: fd.get("senzaEmailCliente") === "1" });
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
  if (!puo(u, "automazioni")) redirect("/impostazioni/automazioni?errore=permesso");
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

/** Recupero dei lead persi: mesi di attesa e promozione del momento (testo e scadenza). */
export async function salvaRecupero(fd: FormData) {
  await amministratore();
  const mesi = Math.round(Number(str(fd, "mesi")));
  const fino = str(fd, "fino");
  const valori: [string, string][] = [
    [CHIAVE_MESI_RECUPERO, String(Number.isFinite(mesi) && mesi >= 1 && mesi <= 24 ? mesi : 3)],
    [CHIAVE_PROMO_TESTO, (str(fd, "testo") ?? "").slice(0, 3000)],
    [CHIAVE_PROMO_FINO, fino && /^\d{4}-\d{2}-\d{2}$/.test(fino) ? fino : ""],
  ];
  for (const [chiave, valore] of valori) await prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });
  revalidatePath("/impostazioni/automazioni");
  redirect("/impostazioni/automazioni?recupero=1");
}

/** Chi può spostare i lead da una persona all'altra: amministratore e marketing (pubblicità). */
const gestisceAssegnazioni = (u: Parameters<typeof puo>[0]) => puo(u, "pubblicita") || puo(u, "marketing");

/** Cambia a chi è assegnato un lead (il marketing/amministratore, o chi lo ha in mano e lo passa a un collega). */
export async function riassegnaLead(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const leadId = str(fd, "leadId");
  const a = str(fd, "telefonistaId");
  const ritorno = str(fd, "ritorno");
  if (!leadId || !a) redirect(torna(ritorno, { errore: "Scegli a chi assegnarlo." }));
  const lead = await prisma.lead.findFirst({ where: { AND: [{ id: leadId! }, scopeLeadWhere(u!)] }, select: { id: true, telefonistaId: true } });
  if (!lead) redirect(torna(ritorno, { errore: "Lead non trovato." }));
  if (!gestisceAssegnazioni(u) && lead!.telefonistaId !== u!.id) redirect(torna(ritorno, { errore: "Puoi passare solo i lead assegnati a te." }));
  const dest = await prisma.utente.findFirst({ where: { id: a!, stato: "ATTIVO" }, select: { id: true, nome: true } });
  if (!dest) redirect(torna(ritorno, { errore: "Persona non trovata o non attiva." }));
  await prisma.lead.update({ where: { id: leadId! }, data: { telefonistaId: dest!.id } });
  await prisma.leadEvento.create({ data: { leadId: leadId!, tipo: "lead.assegnato", testo: `Assegnato a ${dest!.nome}`, utenteNome: u!.nome } });
  revalidatePath("/lead");
  redirect(torna(ritorno, { ok: `Lead assegnato a ${dest!.nome}` }));
}

/** Passa tutti i lead ancora aperti da una persona a un'altra (es. da Alessia a Cristina). */
export async function passaLeadAperti(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const dove = "/impostazioni/lead";
  if (!gestisceAssegnazioni(u)) redirect(`${dove}?errore=${encodeURIComponent("Solo amministratore e marketing")}`);
  const da = str(fd, "da"), a = str(fd, "a");
  if (!da || !a || da === a) redirect(`${dove}?errore=${encodeURIComponent("Scegli da chi e a chi passare i lead")}`);
  const dest = await prisma.utente.findFirst({ where: { id: a!, stato: "ATTIVO" }, select: { id: true, nome: true } });
  if (!dest) redirect(`${dove}?errore=${encodeURIComponent("La persona che li riceve non è attiva")}`);
  const { FASI_APERTE } = await import("@/lib/automazioni/percorsi");
  const aperti = await prisma.lead.findMany({ where: { telefonistaId: da!, fase: { in: FASI_APERTE } }, select: { id: true } });
  if (aperti.length) {
    await prisma.lead.updateMany({ where: { id: { in: aperti.map((l) => l.id) } }, data: { telefonistaId: dest!.id } });
    await prisma.leadEvento.createMany({ data: aperti.map((l) => ({ leadId: l.id, tipo: "lead.assegnato", testo: `Passato a ${dest!.nome} (tutti i lead aperti)`, utenteNome: u!.nome })) });
  }
  revalidatePath("/lead");
  redirect(`${dove}?ok=${encodeURIComponent(`${aperti.length} lead aperti passati a ${dest!.nome}`)}#telefoniste`);
}

/** Nota nella cronologia del lead (resta nello storico, non cambia la fase). */
export async function aggiungiNotaLead(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const leadId = str(fd, "leadId");
  const testo = str(fd, "testo");
  const ritorno = str(fd, "ritorno");
  if (!leadId || !testo) redirect(torna(ritorno, { errore: "Scrivi la nota." }));
  const visibile = await prisma.lead.count({ where: { AND: [{ id: leadId! }, scopeLeadWhere(u!)] } });
  if (!visibile) redirect(torna(ritorno, { errore: "Lead non trovato." }));
  await prisma.leadEvento.create({ data: { leadId: leadId!, tipo: "lead.nota", testo: testo!.slice(0, 2000), utenteNome: u!.nome } });
  revalidatePath(`/lead/${leadId}`);
  redirect(torna(ritorno, { ok: "Nota aggiunta" }));
}

/** Sposta la prossima attività (quando richiamare): cambia solo la scadenza in elenco, il percorso automatico resta quello. */
export async function spostaProssimaAttivita(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const leadId = str(fd, "leadId");
  const quando = daOraRoma(str(fd, "data"));
  const ritorno = str(fd, "ritorno");
  if (!leadId || !quando) redirect(torna(ritorno, { errore: "Scegli giorno e ora." }));
  const visibile = await prisma.lead.count({ where: { AND: [{ id: leadId! }, scopeLeadWhere(u!)] } });
  if (!visibile) redirect(torna(ritorno, { errore: "Lead non trovato." }));
  await prisma.lead.update({ where: { id: leadId! }, data: { scadenzaAzione: quando } });
  const testo = quando!.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  await prisma.leadEvento.create({ data: { leadId: leadId!, tipo: "lead.spostato", testo: `Prossima attività spostata a ${testo}`, utenteNome: u!.nome } });
  revalidatePath("/lead");
  redirect(torna(ritorno, { ok: `Prossima attività: ${testo}` }));
}

/** Corregge l'anagrafica del lead (nome, telefono, email, comune, CAP, prodotto) senza trasformarlo in cliente. */
export async function modificaDatiLead(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const leadId = str(fd, "leadId");
  const ritorno = str(fd, "ritorno");
  const nome = str(fd, "nome");
  if (!leadId) redirect(torna(ritorno, { errore: "Lead non trovato." }));
  if (!nome) redirect(torna(ritorno, { errore: "Il nome non può restare vuoto." }));
  const lead = await prisma.lead.findFirst({ where: { AND: [{ id: leadId! }, scopeLeadWhere(u!)] }, select: { nome: true, telefono: true, email: true, comune: true, cap: true, prodotto: true, fonte: true, brandId: true, brand: { select: { nome: true } } } });
  if (!lead) redirect(torna(ritorno, { errore: "Lead non trovato." }));
  const email = str(fd, "email")?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(torna(ritorno, { errore: "L'email non sembra valida." }));
  const nuovi = { nome: nome!.slice(0, 200), telefono: str(fd, "telefono"), email, comune: str(fd, "comune"), cap: str(fd, "cap"), prodotto: str(fd, "prodotto") };
  const ETICHETTE: Record<keyof typeof nuovi, string> = { nome: "nome", telefono: "telefono", email: "email", comune: "comune", cap: "CAP", prodotto: "prodotto" };
  const cambi = (Object.keys(nuovi) as (keyof typeof nuovi)[]).filter((k) => (lead![k] ?? null) !== nuovi[k]);
  const testi = cambi.map((k) => `${ETICHETTE[k]} «${lead![k] ?? "—"}» → «${nuovi[k] ?? "—"}»`);
  // marchio e provenienza (richiesta di Rocco): solo se nel modulo e cambiati
  const extra: { brandId?: string; fonte?: string } = {};
  const brandId = str(fd, "brandId");
  if (brandId && brandId !== lead!.brandId) {
    const b = await prisma.brand.findUnique({ where: { id: brandId }, select: { nome: true } });
    if (b) { extra.brandId = brandId; testi.push(`marchio «${lead!.brand.nome}» → «${b.nome}»`); }
  }
  const fonte = str(fd, "fonte");
  if (fonte && fonte !== lead!.fonte) { extra.fonte = fonte.slice(0, 60); testi.push(`provenienza «${lead!.fonte}» → «${fonte}»`); }
  if (!testi.length) redirect(torna(ritorno, { ok: "Nessuna modifica" }));
  await prisma.lead.update({ where: { id: leadId! }, data: { ...nuovi, ...extra } });
  await prisma.leadEvento.create({
    data: { leadId: leadId!, tipo: "lead.dati", utenteNome: u!.nome, testo: `Dati corretti: ${testi.join(", ")}` },
  });
  revalidatePath("/lead");
  revalidatePath(`/lead/${leadId}`);
  redirect(torna(ritorno, { ok: "Dati del lead aggiornati" }));
}
