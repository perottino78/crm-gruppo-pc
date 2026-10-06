export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { aggiornaSoggetto, eliminaSoggetto } from "@/app/commesse-actions";
import SoggettoForm from "@/components/SoggettoForm";

export default async function SoggettoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utente = await getCurrentUser();
  const gestore = utente?.ruolo === "AMMINISTRATORE" || utente?.ruolo === "AMMINISTRATIVO";
  const [s, utenti] = await Promise.all([
    prisma.soggetto.findUnique({ where: { id } }),
    prisma.utente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  if (!s) notFound();
  return (
    <div className="max-w-5xl">
      <Link href="/impostazioni/anagrafica" className="text-xs text-neutral-600 hover:underline">← Anagrafica</Link>
      <h1 className="text-2xl font-bold text-neutral-900 mt-2 mb-4">{s.ragioneSociale}</h1>
      <form action={aggiornaSoggetto} className="bg-white rounded-lg border border-neutral-200 p-4">
        <input type="hidden" name="id" value={s.id} />
        <fieldset disabled={!gestore} className="contents">
          <SoggettoForm s={s} utenti={utenti} />
        </fieldset>
        {gestore && <button className="btn-3d btn-3d-blue text-sm px-4 py-2 mt-4">Salva modifiche</button>}
      </form>
      {isAmministratore(utente) && (
        <form action={eliminaSoggetto} className="mt-4">
          <input type="hidden" name="id" value={s.id} />
          <button className="text-xs text-red-700 underline">Elimina soggetto</button>
        </form>
      )}
    </div>
  );
}
