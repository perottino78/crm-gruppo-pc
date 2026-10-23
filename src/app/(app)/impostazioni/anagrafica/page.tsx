export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { creaSoggetto } from "@/app/commesse-actions";
import SoggettoForm, { RUOLI_LABEL } from "@/components/SoggettoForm";

export default async function AnagraficaPage({ searchParams }: { searchParams: Promise<{ ruolo?: string; q?: string }> }) {
  const { ruolo, q } = await searchParams;
  const utente = await getCurrentUser();
  const gestore = utente?.ruolo === "AMMINISTRATORE" || utente?.ruolo === "AMMINISTRATIVO";
  const [soggetti, utenti, clienti] = await Promise.all([
    prisma.soggetto.findMany({
      where: {
        ...(ruolo ? { ruoli: { has: ruolo } } : {}),
        ...(q ? { OR: [{ ragioneSociale: { contains: q, mode: "insensitive" } }, { partitaIva: { contains: q } }] } : {}),
      },
      orderBy: { ragioneSociale: "asc" },
    }),
    prisma.utente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    gestore ? prisma.cliente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true }, take: 500 }) : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-5xl">
      <Link href="/impostazioni" className="text-xs text-neutral-600 hover:underline">← Impostazioni</Link>
      <h1 className="text-2xl font-bold text-neutral-900 mt-2 mb-1">Anagrafica fornitori, posatori e tecnici</h1>
      <p className="text-sm text-neutral-700 mb-4">Un solo elenco: ogni soggetto può avere più ruoli (es. un cliente che diventa anche fornitore).</p>

      <form className="flex flex-wrap items-center gap-2 mb-4">
        <input name="q" defaultValue={q ?? ""} placeholder="Cerca per nome o P.IVA" className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-64" />
        <select name="ruolo" defaultValue={ruolo ?? ""} className="border border-neutral-300 rounded px-2 py-1.5 text-sm">
          <option value="">Tutti i ruoli</option>
          {Object.entries(RUOLI_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn-3d btn-3d-dark text-xs px-3 py-1.5">Filtra</button>
      </form>

      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-8">
        {soggetti.map((s) => (
          <Link key={s.id} href={`/impostazioni/anagrafica/${s.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-neutral-50">
            <div>
              <p className={`text-sm font-semibold ${s.attivo ? "text-neutral-900" : "text-neutral-400 line-through"}`}>{s.ragioneSociale}</p>
              <p className="text-xs text-neutral-600">{[s.partitaIva && `P.IVA ${s.partitaIva}`, s.comune, s.telefono, s.emailOrdini ?? s.email].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="flex gap-1">
              {s.ruoli.map((r) => (
                <span key={r} className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900">{RUOLI_LABEL[r] ?? r}</span>
              ))}
            </div>
          </Link>
        ))}
        {soggetti.length === 0 && <p className="px-4 py-3 text-sm text-neutral-600">Nessun soggetto presente.</p>}
      </div>

      {gestore && (
        <form action={creaSoggetto} className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-base font-bold text-neutral-900 mb-3">Nuovo soggetto</h2>
          <div className="mb-4 flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Parti da un cliente esistente (opzionale)</label>
              <select name="clienteOrigineId" className="border border-neutral-300 rounded px-2 py-1.5 text-sm min-w-[260px]">
                <option value="">— nessuno —</option>
                {clienti.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>
          <SoggettoForm utenti={utenti} />
          <button className="btn-3d btn-3d-green text-sm px-4 py-2 mt-4">Crea soggetto</button>
        </form>
      )}
    </div>
  );
}
