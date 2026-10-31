import { NextResponse } from "next/server";
import { eseguiInviiScaduti } from "@/lib/automazioni/motore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Controllo periodico degli invii programmati (Vercel Cron o un servizio esterno ogni 5-10 minuti).
// Non serve una chiave: esegue soltanto ciò che è già scaduto, senza doppioni, ed è sicuro da chiamare più volte.
export async function GET() {
  return NextResponse.json(await eseguiInviiScaduti());
}
export const POST = GET;
