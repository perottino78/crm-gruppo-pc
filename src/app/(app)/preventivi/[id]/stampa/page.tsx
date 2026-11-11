export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { scopePreventivoWhere } from "@/lib/scope";
import StampaOfferta from "@/components/preventivi/StampaOfferta";

// Anteprima dell'offerta come la vede il cliente. In alto (non in stampa): torna all'offerta, stampa/salva PDF
// (pulsante in alto a destra) o invia al cliente — richiesta di Rocco, «Guarda anteprima».
export default async function StampaPreventivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utenteCorrente = await getCurrentUser();
  if (!utenteCorrente) notFound();
  return (
    <>
      <div className="print:hidden max-w-3xl mx-auto mb-3 flex flex-wrap items-center gap-2 pr-48">
        <Link href={`/preventivi/${id}`} className="btn-indietro">← Torna all&apos;offerta</Link>
        <Link href={`/preventivi/${id}/invia`} className="btn-3d btn-3d-green text-sm px-4 py-2">✉️ Invia al cliente</Link>
        <span className="text-xs text-neutral-500">Anteprima: è l&apos;offerta come la vede il cliente.</span>
      </div>
      <StampaOfferta id={id} scope={scopePreventivoWhere(utenteCorrente)} />
    </>
  );
}
