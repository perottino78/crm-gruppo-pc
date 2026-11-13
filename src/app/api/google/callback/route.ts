import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { aggiornaCalendariGoogle, completaConsenso, verificaStatoOAuth } from "@/lib/calendario/google";
import { calendariBconsole } from "@/lib/calendario/googlecal";

export const dynamic = "force-dynamic";

// Ritorno da Google dopo il consenso: salva l'accesso permanente (cifrato) e propone l'abbinamento dei calendari BCONSOLE alle persone.
// Il «state» firmato (valido 30 minuti) dice che il giro è partito da un amministratore di P&C ONE.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const pagina = new URL("/impostazioni/google", process.env.GOOGLE_REDIRECT_BASE || req.nextUrl.origin);
  const vai = (k: "ok" | "errore", v: string) => { pagina.searchParams.set(k, v); return NextResponse.redirect(pagina); };
  const utenteId = verificaStatoOAuth(q.get("state") ?? "");
  if (!utenteId) return vai("errore", "Collegamento scaduto o non valido: premi di nuovo «Collega Google»");
  const u = await prisma.utente.findUnique({ where: { id: utenteId }, select: { ruolo: true, stato: true } });
  if (!u || u.stato !== "ATTIVO") return vai("errore", "Utente non valido");
  if (q.get("error")) return vai("errore", q.get("error") === "access_denied" ? "Su Google non è stato dato il permesso: riprova e premi «Consenti»" : `Google ha risposto: ${q.get("error")}`);
  const code = q.get("code");
  if (!code) return vai("errore", "Google non ha mandato il codice di accesso");
  const r = await completaConsenso(code);
  if (!r.ok) return vai("errore", `Collegamento non riuscito: ${r.errore}`);
  try {
    const cal = await aggiornaCalendariGoogle();
    const b = calendariBconsole(cal);
    return vai("ok", `Collegato${r.email ? ` all'account ${r.email}` : ""}: ${b.length} calendari «BCONSOLE», ${b.filter((c) => c.utenteId).length} abbinati a una persona. Controlla gli abbinamenti e salva.`);
  } catch (e) {
    return vai("errore", `Collegato, ma l'elenco dei calendari non è arrivato: ${e instanceof Error ? e.message : String(e)}`);
  }
}
