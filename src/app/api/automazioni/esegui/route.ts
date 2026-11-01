import { NextResponse } from "next/server";
import { eseguiInviiScaduti } from "@/lib/automazioni/motore";
import { eseguiCampagne } from "@/lib/campagne/motore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Controllo periodico degli invii programmati dei lead e delle campagne (coda e avvisi di scadenza) (Vercel Cron o un servizio esterno ogni 5-10 minuti).
// Non serve una chiave: esegue soltanto ciò che è già scaduto, senza doppioni, ed è sicuro da chiamare più volte.
export async function GET() {
  const lead = await eseguiInviiScaduti();
  const campagne = await eseguiCampagne();
  return NextResponse.json({ ...lead, campagne });
}
export const POST = GET;
