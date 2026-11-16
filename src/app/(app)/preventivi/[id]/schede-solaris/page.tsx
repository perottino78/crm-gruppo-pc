export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scopePreventivoWhere } from "@/lib/scope";
import { leggiSchedeSolaris } from "@/lib/solaris/schede-offerta";
import SchedeSolaris from "@/components/preventivi/SchedeSolaris";

// «apri la scheda» delle righe ☀️ dell'offerta: le schede tecniche del fotovoltaico scelte nello Studio.
export default async function SchedeSolarisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utente = await getCurrentUser();
  if (!utente) notFound();
  const p = await prisma.preventivo.findFirst({
    where: { id, ...scopePreventivoWhere(utente) },
    select: { id: true, solarisProgetto: { select: { statoJson: true } } },
  });
  if (!p) notFound();
  const schede = leggiSchedeSolaris(p.solarisProgetto?.statoJson ?? null);
  return (
    <div className="max-w-3xl mx-auto">
      <div className="print:hidden mb-4">
        <Link href={`/preventivi/${id}`} className="btn-indietro">← Torna all&apos;offerta</Link>
      </div>
      {schede.length ? (
        <SchedeSolaris schede={schede} />
      ) : (
        <p className="text-sm text-neutral-600">Nessuna scheda: apri Solaris Studio e torna all&apos;offerta con «← Torna al preventivo».</p>
      )}
    </div>
  );
}
