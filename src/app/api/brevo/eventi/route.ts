import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { chiaveWebhook } from "@/lib/mail/servizio";
import { azioneBrevo, type EventoBrevo } from "@/lib/mail/eventi-brevo";
import { applicaRimbalzo } from "@/lib/mail/rimbalzi-server";

export const dynamic = "force-dynamic";

// Webhook di Brevo (Impostazioni › Email automatiche › Servizio di invio mostra l'indirizzo da incollare in Brevo):
// rimbalzi → invio RIMBALZATA e indirizzo da non usare più se permanente (come i rimbalzi letti dalla casella);
// disiscrizioni e segnalazioni di spam → cliente e lead disiscritti dalle email commerciali.
// Protetto dalla chiave nell'indirizzo (?k=…). Risponde sempre 200 a Brevo per gli eventi validi, così non li rimanda.
export async function POST(req: NextRequest) {
  const k = req.nextUrl.searchParams.get("k") ?? "";
  if (!k || k !== (await chiaveWebhook())) return NextResponse.json({ errore: "chiave non valida" }, { status: 401 });
  const corpo = await req.json().catch(() => null);
  const eventi: EventoBrevo[] = Array.isArray(corpo) ? corpo : corpo && typeof corpo === "object" ? [corpo] : [];
  const fatti = { rimbalzi: 0, disiscritti: 0, ignorati: 0 };
  for (const x of eventi.slice(0, 500)) {
    const az = azioneBrevo(x);
    const quando = x.date && !isNaN(Date.parse(x.date)) ? new Date(x.date) : new Date();
    if (az.tipo === "RIMBALZO") {
      await applicaRimbalzo({ destinatari: [az.email], codice: az.codice, permanente: az.permanente, motivo: az.motivo }, quando);
      fatti.rimbalzi++;
    } else if (az.tipo === "DISISCRITTO") {
      await prisma.cliente.updateMany({ where: { email: { equals: az.email, mode: "insensitive" }, disiscritto: false }, data: { disiscritto: true, disiscrittoIl: quando } });
      await prisma.lead.updateMany({ where: { email: { equals: az.email, mode: "insensitive" }, disiscritto: false }, data: { disiscritto: true, disiscrittoIl: quando } });
      fatti.disiscritti++;
    } else fatti.ignorati++;
  }
  return NextResponse.json({ ok: true, ...fatti });
}
