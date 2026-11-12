import { NextResponse } from "next/server";
import { eseguiInviiScaduti } from "@/lib/automazioni/motore";
import { eseguiCampagne } from "@/lib/campagne/motore";
import { inviaEmailObiettivi } from "@/lib/provvigioni/obiettivi-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Controllo periodico degli invii programmati dei lead e delle campagne (coda e avvisi di scadenza) (Vercel Cron o un servizio esterno ogni 5-10 minuti).
// Non serve una chiave: esegue soltanto ciò che è già scaduto, senza doppioni, ed è sicuro da chiamare più volte.
export async function GET() {
  const lead = await eseguiInviiScaduti();
  const campagne = await eseguiCampagne();
  // il punto della settimana sugli obiettivi dei commerciali (una volta a settimana, dal lunedì)
  const obiettivi = await inviaEmailObiettivi().catch((e) => ({ errore: String(e).slice(0, 200) }));
  const nextcloud = await import("@/lib/calendario/nextcloud").then((m) => m.sincronizzaNextcloud()).catch((e) => ({ errore: String(e).slice(0, 200) }));
  return NextResponse.json({ ...lead, campagne, obiettivi, nextcloud });
}
export const POST = GET;
