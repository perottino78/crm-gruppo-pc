export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { chiaveGiorno, giornoBreve, oraRoma } from "@/lib/calendario/tempo";
import { annullaRiunione } from "@/app/calendario-actions";
import BottoneConferma from "@/components/BottoneConferma";

/** Riunione interna: chi c'è, quando e dove; si può annullare (avviso a tutti). */
export default async function RiunionePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, u] = await Promise.all([params, getCurrentUser()]);
  if (!u) notFound();
  const r = await prisma.riunione.findUnique({ where: { id } });
  if (!r) notFound();
  const persone = await prisma.utente.findMany({ where: { id: { in: r.partecipanti } }, select: { id: true, nome: true }, orderBy: { nome: "asc" } });
  const giorno = chiaveGiorno(r.dataOra);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/calendario?giorno=${giorno}`} className="btn-indietro">← Calendario</Link>
      <div className="rounded-2xl border-2 border-neutral-300 bg-white p-5">
        <p className="text-xs font-bold uppercase text-neutral-500">👥 Riunione interna {r.stato === "ANNULLATO" && <span className="ml-1 rounded bg-red-100 px-1.5 text-red-800">annullata</span>}</p>
        <h1 className="mt-1 text-xl font-black text-neutral-900">{r.titolo}</h1>
        <p className="mt-1 text-sm text-neutral-800">📅 {giornoBreve(giorno)} ore {oraRoma(r.dataOra)} · {r.durataMin} min{r.luogo ? ` · 📍 ${r.luogo}` : ""}</p>
        <p className="mt-2 text-sm"><span className="text-neutral-500">Partecipanti:</span> <b>{persone.map((x) => x.nome).join(", ") || "—"}</b></p>
        {r.note && <p className="mt-2 whitespace-pre-line text-sm text-neutral-800">📝 {r.note}</p>}
        <p className="mt-2 text-[11px] text-neutral-500">Fissata da {r.creatoDaNome ?? "—"}</p>
        {r.stato !== "ANNULLATO" && (
          <form action={annullaRiunione} className="mt-4">
            <input type="hidden" name="id" value={r.id} />
            <BottoneConferma messaggio="Annullare la riunione? I partecipanti ricevono l'avviso." className="btn-3d btn-3d-red px-4 py-2 text-sm">❌ Annulla la riunione</BottoneConferma>
          </form>
        )}
      </div>
    </div>
  );
}
