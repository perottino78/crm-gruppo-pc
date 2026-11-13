"use server";

// Collegamento ai calendari Nextcloud (Impostazioni › Calendario Nextcloud): accesso, abbinamento calendari → persone, sincronizza ora.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { abbinaCalendario } from "@/lib/calendario/ical";
import { configNextcloud, elencaCalendari, salvaAccessoNextcloud, salvaCalendariNextcloud, sincronizzaNextcloud, CHIAVI_NC, type CalendarioAbbinato } from "@/lib/calendario/nextcloud";

const PAGINA = "/impostazioni/nextcloud";
const vai = (p: Record<string, string>) => redirect(`${PAGINA}?${new URLSearchParams(p)}`);
async function chi() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "calendario.nextcloud")) vai({ errore: "Solo l'amministratore collega i calendari Nextcloud" });
  return u!;
}

/** Salva indirizzo, utente e password per app, prova il collegamento e propone l'abbinamento dei calendari alle persone. */
export async function salvaAccesso(fd: FormData) {
  await chi();
  const url = String(fd.get("url") ?? "").trim(), utente = String(fd.get("utente") ?? "").trim(), password = String(fd.get("password") ?? "").trim() || null;
  if (!/^https?:\/\/[^\s]+$/.test(url) || !utente) vai({ errore: "Scrivi l'indirizzo del server (https://…) e il nome utente" });
  await salvaAccessoNextcloud(url, utente, password);
  const cfg = await configNextcloud();
  if (!cfg.dav) vai({ errore: "Manca la password per app" });
  let trovati;
  try { trovati = await elencaCalendari(cfg.dav!); }
  catch (e) { vai({ errore: `Collegamento non riuscito: ${e instanceof Error ? e.message : String(e)}` }); }
  if (trovati!.length === 0) vai({ errore: `Nextcloud ha risposto ma con l'utente «${utente}» non c'è nessun calendario. Nel campo «Utente Nextcloud» va il nome utente o l'email con cui entri in Nextcloud, non il nome dato alla password («P&C ONE»).` });
  const utenti = await prisma.utente.findMany({ where: { stato: "ATTIVO" }, select: { id: true, nome: true } });
  const prima = new Map(cfg.calendari.map((c) => [c.href, c]));
  const calendari: CalendarioAbbinato[] = trovati!.map((c) => prima.get(c.href) ?? { href: c.href, nome: c.nome, utenteId: abbinaCalendario(c.nome, utenti), scrivi: false });
  await salvaCalendariNextcloud(calendari);
  revalidatePath(PAGINA);
  vai({ ok: `Collegato: ${trovati!.length} calendari trovati, ${calendari.filter((c) => c.utenteId).length} abbinati a una persona. Controlla gli abbinamenti e salva.` });
}

/** Abbinamento calendario → persona e «scrivi qui gli impegni di P&C ONE» (uno per persona). */
export async function salvaAbbinamenti(fd: FormData) {
  await chi();
  const cfg = await configNextcloud();
  const scrivePer = new Set<string>();
  const calendari = cfg.calendari.map((c, i) => {
    const utenteId = String(fd.get(`utente_${i}`) ?? "") || null;
    let scrivi = fd.get(`scrivi_${i}`) === "1" && !!utenteId;
    if (scrivi && scrivePer.has(utenteId!)) scrivi = false; // un solo calendario di scrittura per persona
    if (scrivi) scrivePer.add(utenteId!);
    return { ...c, utenteId, scrivi };
  });
  await salvaCalendariNextcloud(calendari);
  revalidatePath(PAGINA);
  vai({ ok: `Abbinamenti salvati: ${calendari.filter((c) => c.utenteId).length} calendari letti, ${scrivePer.size} in cui P&C ONE scrive.` });
}

export async function sincronizzaOra() {
  await chi();
  const r = await sincronizzaNextcloud({ forza: true });
  revalidatePath(PAGINA);
  revalidatePath("/calendario");
  const cfg = await configNextcloud();
  if (!r.fatto) vai({ errore: r.motivo ?? "Non fatto" });
  vai(cfg.stato?.ok ? { ok: cfg.stato.messaggio } : { errore: cfg.stato?.messaggio ?? "Problema nella sincronizzazione" });
}

/** Scollega: P&C ONE smette di leggere e scrivere; gli impegni letti da Nextcloud spariscono dal calendario (su Nextcloud resta tutto). */
export async function scollegaNextcloud() {
  await chi();
  await prisma.configurazione.deleteMany({ where: { chiave: { in: Object.values(CHIAVI_NC) } } });
  await prisma.eventoNextcloud.deleteMany({ where: { NOT: { calendario: { startsWith: "google:" } } } }); // quelli di Google restano
  revalidatePath(PAGINA);
  vai({ ok: "Nextcloud scollegato. Sui calendari Nextcloud non è stato cancellato nulla." });
}
