export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { firmaPredefinita, qualifica } from "@/lib/mail/firma";
import EditorFirma from "@/components/mail/EditorFirma";

/** Firme email di tutti i colleghi (amministratore e marketing): ognuno la sua, usata in «Invia offerta». */
export default async function FirmePage({ searchParams }: { searchParams: Promise<{ firmaSalvata?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u || !(puo(u, "firme") || puo(u, "marketing"))) notFound();
  const { firmaSalvata, errore } = await searchParams;
  const utenti = await prisma.utente.findMany({
    where: { stato: { not: "DISATTIVATO" } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, email: true, telefono: true, ruolo: true, ufficio: true, firmaEmail: true },
  });
  const fatte = utenti.filter((x) => x.firmaEmail?.trim()).length;

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href="/impostazioni" className="text-xs text-neutral-600 hover:underline">← Impostazioni</Link>
        <h1 className="text-2xl font-extrabold text-neutral-900">✍️ Firme email del team</h1>
        <p className="text-sm text-neutral-600">
          La firma di ognuno va in fondo alle email che manda dal CRM (es. «Invia offerta»). Chi non ha ancora una firma usa quella pronta, fatta
          con nome, ruolo, cellulare ed email della sua scheda. Ognuno può cambiare la sua anche dal Profilo. {fatte} di {utenti.length} personalizzate.
        </p>
      </div>
      {errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{errore}</p>}
      <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
        {utenti.map((x) => (
          <details key={x.id} id={`f-${x.id}`} open={firmaSalvata === x.id} className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-neutral-50">
              <span className="flex items-center gap-2 text-sm">
                <span className="text-neutral-400 transition-transform group-open:rotate-90">▶</span>
                <b className="text-neutral-900">{x.nome}</b>
                <span className="text-xs text-neutral-500">{qualifica(x) || x.ruolo}</span>
              </span>
              {x.firmaEmail?.trim()
                ? <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800">✏️ personalizzata</span>
                : <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-500">firma pronta</span>}
            </summary>
            <div className="bg-neutral-50/60 px-4 pb-4 pt-2">
              {!x.telefono && <p className="mb-2 text-xs text-amber-800">Manca il cellulare nella scheda: aggiungilo in Impostazioni › Utenti o scrivilo qui nella firma.</p>}
              <EditorFirma utenteId={x.id} firma={x.firmaEmail} predefinita={firmaPredefinita(x)} torna="/impostazioni/firme" salvata={firmaSalvata === x.id} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
