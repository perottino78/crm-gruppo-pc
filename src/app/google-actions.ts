"use server";

// Collegamento a Google Calendar (Impostazioni › Google Calendar): credenziali dell'app Google, abbinamento calendari → persone, sincronizza, scollega.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { fotoGoogle, faldeGoogle, salvaChiaveGoogleMaps } from "@/lib/solaris/google-mappe";
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

/** Chiave Google Maps per Solaris Studio (foto satellitare nitida e falde dal Solar API): si prova subito e si salva cifrata. */
export async function salvaChiaveMappe(fd: FormData) {
  await chi();
  if (fd.get("togli") === "1") {
    await salvaChiaveGoogleMaps(null);
    revalidatePath(PAGINA);
    vai({ ok: "Chiave Google Maps tolta: Solaris Studio usa di nuovo le immagini Esri." });
  }
  const k = String(fd.get("chiave") ?? "").trim();
  if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(k)) vai({ errore: "La chiave API di Google comincia con «AIza»: copiala per intero dalla Google Cloud Console" });
  // prova sulla sede di Rosta
  const foto = await fotoGoogle(45.0849, 7.4755, 20, k).catch((e) => ({ errore: String(e) }));
  if ("errore" in foto) vai({ errore: `Google non accetta la chiave per le foto (attiva «Maps Static API» nel progetto e la fatturazione): ${foto.errore}` });
  const tetto = await faldeGoogle(45.0849, 7.4755, k).catch((e) => ({ errore: String(e) }));
  await salvaChiaveGoogleMaps(k);
  revalidatePath(PAGINA);
  vai({ ok: "errore" in tetto
    ? `Chiave salvata: le foto dal satellite arrivano da Google. Il riconoscimento automatico delle falde non è attivo (attiva «Solar API» nel progetto): ${tetto.errore}`
    : `Chiave salvata e provata: foto da Google e riconoscimento delle falde attivi (sulla sede trovate ${tetto.falde.length} falde).` });
}
