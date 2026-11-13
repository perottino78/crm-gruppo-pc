import { NextResponse, after, type NextRequest } from "next/server";
import { eseguiInviiScaduti } from "@/lib/automazioni/motore";
import { eseguiCampagne } from "@/lib/campagne/motore";
import { inviaEmailObiettivi } from "@/lib/provvigioni/obiettivi-server";
import { inviaPromemoriaEsiti } from "@/lib/appuntamenti/esiti-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Tutti i controlli, uno dopo l'altro (un errore in uno non ferma gli altri). */
async function eseguiTutto() {
  const lead = await eseguiInviiScaduti().catch((e) => ({ errore: String(e).slice(0, 200) }));
  const campagne = await eseguiCampagne().catch((e) => ({ errore: String(e).slice(0, 200) }));
  // il punto della settimana sugli obiettivi dei commerciali (una volta a settimana, dal lunedì)
  const obiettivi = await inviaEmailObiettivi().catch((e) => ({ errore: String(e).slice(0, 200) }));
  const esiti = await inviaPromemoriaEsiti().catch((e) => ({ errore: String(e).slice(0, 200) }));
  const nextcloud = await import("@/lib/calendario/nextcloud").then((m) => m.sincronizzaNextcloud()).catch((e) => ({ errore: String(e).slice(0, 200) }));
  const google = await import("@/lib/calendario/google").then((m) => m.sincronizzaGoogle()).catch((e) => ({ errore: String(e).slice(0, 200) }));
  return { ...lead, campagne, obiettivi, esiti, nextcloud, google };
}

// Controllo periodico degli invii programmati dei lead e delle campagne (coda e avvisi di scadenza) (Vercel Cron o un servizio esterno ogni 5 minuti,
// es. cron-job.org). Non serve una chiave: esegue soltanto ciò che è già scaduto, senza doppioni, ed è sicuro da chiamare più volte.
// Risponde subito e lavora dopo la risposta (`after`): i servizi esterni aspettano al massimo 30 secondi, un blocco di email può metterci di più.
// Con `?attendi=1` aspetta la fine e mostra il resoconto (per controlli a mano).
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("attendi") === "1") return NextResponse.json(await eseguiTutto());
  after(() => eseguiTutto().then(() => undefined));
  return NextResponse.json({ avviato: true, il: new Date().toISOString() });
}
export const POST = GET;
