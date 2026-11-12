export const dynamic = "force-dynamic";

// Impegno letto da un calendario Nextcloud (sola lettura: si modifica su Nextcloud).
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { chiaveGiorno, giornoBreve, oraRoma } from "@/lib/calendario/tempo";

export default async function EsternoPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, u] = await Promise.all([params, getCurrentUser()]);
  if (!u) notFound();
  const e = await prisma.eventoNextcloud.findUnique({ where: { id } });
  if (!e) notFound();
  const persona = await prisma.utente.findUnique({ where: { id: e.utenteId }, select: { nome: true } });
  const g = chiaveGiorno(e.inizio);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/calendario?giorno=${g}`} className="btn-indietro">← Calendario</Link>
      <div className="rounded-2xl border-2 border-neutral-300 bg-white p-5">
        <p className="text-xs font-bold uppercase text-neutral-500">🗓️ Dal calendario Nextcloud di {persona?.nome ?? "—"}</p>
        <h1 className="mt-1 text-xl font-black text-neutral-900">{e.titolo}</h1>
        <p className="mt-1 text-sm text-neutral-800">📅 {giornoBreve(g)}{e.giornataIntera ? " · tutto il giorno" : ` ore ${oraRoma(e.inizio)} – ${oraRoma(e.fine)}`}{e.luogo ? ` · 📍 ${e.luogo}` : ""}</p>
        {e.note && <p className="mt-2 whitespace-pre-line text-sm text-neutral-800">📝 {e.note}</p>}
        <p className="mt-3 text-[11px] text-neutral-500">Questo impegno è stato scritto su Nextcloud: per cambiarlo usa il calendario Nextcloud, qui si aggiorna da solo.</p>
      </div>
    </div>
  );
}
