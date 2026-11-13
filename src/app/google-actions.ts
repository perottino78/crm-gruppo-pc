"use server";

// Collegamento a Google Calendar (Impostazioni › Google Calendar): credenziali dell'app Google, abbinamento calendari → persone, sincronizza, scollega.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { aggiornaCalendariGoogle, configGoogle, salvaCalendariGoogle, salvaCredenzialiGoogle, scollegaGoogle, sincronizzaGoogle } from "@/lib/calendario/google";

const PAGINA = "/impostazioni/google";
const vai = (p: Record<string, string>) => redirect(`${PAGINA}?${new URLSearchParams(p)}`);
async function chi() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "calendario.google")) vai({ errore: "Solo l'amministratore collega Google Calendar" });
  return u!;
}

/** Passo 1: Client ID e Client secret dell'app creata nella Google Cloud Console (il secret si salva cifrato). */
export async function salvaCredenziali(fd: FormData) {
  await chi();
  const id = String(fd.get("clientId") ?? "").trim(), secret = String(fd.get("clientSecret") ?? "").trim() || null;
  if (!/\.apps\.googleusercontent\.com$/.test(id)) vai({ errore: "Il Client ID finisce con «.apps.googleusercontent.com»: copialo per intero dalla Google Cloud Console" });
  const cfg = await configGoogle();
  if (!secret && !cfg.haSecret) vai({ errore: "Manca il Client secret" });
  await salvaCredenzialiGoogle(id, secret);
  revalidatePath(PAGINA);
  vai({ ok: "Credenziali salvate. Ora premi «Collega Google» ed entra con l'account dell'amministrazione." });
}

/** Rilegge l'elenco dei calendari da Google (nuovi calendari BCONSOLE, nomi cambiati); gli abbinamenti già fatti restano. */
export async function aggiornaCalendari() {
  await chi();
  let n = 0;
  try { n = (await aggiornaCalendariGoogle()).length; }
  catch (e) { vai({ errore: `Elenco dei calendari non riuscito: ${e instanceof Error ? e.message : String(e)}` }); }
  revalidatePath(PAGINA);
  vai({ ok: `Trovati ${n} calendari «BCONSOLE».` });
}

/** Passo 3: di chi è ogni calendario e se P&C ONE ci scrive (un solo calendario di scrittura per persona). */
export async function salvaAbbinamentiGoogle(fd: FormData) {
  await chi();
  const cfg = await configGoogle();
  const scrivePer = new Set<string>();
  const calendari = cfg.calendari.map((c, i) => {
    const utenteId = String(fd.get(`utente_${i}`) ?? "") || null;
    let scrivi = fd.get(`scrivi_${i}`) === "1" && !!utenteId;
    if (scrivi && scrivePer.has(utenteId!)) scrivi = false;
    if (scrivi) scrivePer.add(utenteId!);
    return { ...c, utenteId, scrivi };
  });
  await salvaCalendariGoogle(calendari);
  revalidatePath(PAGINA);
  vai({ ok: `Abbinamenti salvati: ${calendari.filter((c) => c.utenteId).length} calendari letti, ${scrivePer.size} in cui P&C ONE scrive gli appuntamenti nuovi.` });
}

export async function sincronizzaGoogleOra() {
  await chi();
  const r = await sincronizzaGoogle({ forza: true });
  revalidatePath(PAGINA);
  revalidatePath("/calendario");
  if (!r.fatto) vai({ errore: r.motivo ?? "Non fatto" });
  const cfg = await configGoogle();
  vai(cfg.stato?.ok ? { ok: cfg.stato.messaggio } : { errore: cfg.stato?.messaggio ?? "Problema nella sincronizzazione" });
}

/** Scollega: P&C ONE smette di leggere e scrivere. Su Google non si cancella nulla. */
export async function scollegaGoogleOra() {
  await chi();
  await scollegaGoogle();
  revalidatePath(PAGINA);
  revalidatePath("/calendario");
  vai({ ok: "Google scollegato. Su Google Calendar non è stato cancellato nulla." });
}
