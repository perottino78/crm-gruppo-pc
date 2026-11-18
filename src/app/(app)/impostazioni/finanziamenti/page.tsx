export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { leggiTabelleFinanziamento } from "@/lib/finanziamenti/server";
import { salvaTabellaFinanziamento, eliminaTabellaFinanziamento, ripristinaTabelleFinanziamento } from "@/app/finanziamenti-actions";
import type { TabellaFinanziamento } from "@/lib/finanziamenti/tabelle";

const input = "mt-1 w-full border border-neutral-300 rounded px-2 py-1 text-sm font-normal";

function Campi({ t }: { t?: TabellaFinanziamento }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {t && <input type="hidden" name="id" value={t.id} />}
      <label className="text-xs font-semibold text-neutral-700 col-span-2 md:col-span-4">Nome (lo vede il commerciale)
        <input name="nome" defaultValue={t?.nome ?? ""} required className={input} placeholder="es. TAN 5,99% — prima rata a 90 giorni" />
      </label>
      <label className="text-xs font-semibold text-neutral-700">Importo minimo €<input name="importoMin" defaultValue={t?.importoMin ?? 1000} className={input} /></label>
      <label className="text-xs font-semibold text-neutral-700">Importo massimo €<input name="importoMax" defaultValue={t?.importoMax ?? 55000} className={input} /></label>
      <label className="text-xs font-semibold text-neutral-700">Rate da<input name="rateDa" defaultValue={t?.rateDa ?? 12} className={input} /></label>
      <label className="text-xs font-semibold text-neutral-700">Rate fino a<input name="rateA" defaultValue={t?.rateA ?? 120} className={input} /></label>
      <label className="text-xs font-semibold text-neutral-700">Prima rata dopo (giorni)
        <select name="giorniPrimaRata" defaultValue={t?.giorniPrimaRata ?? 90} className={input}>{[30, 60, 90, 120].map((g) => <option key={g} value={g}>{g}</option>)}</select>
      </label>
      <label className="text-xs font-semibold text-neutral-700">TAN al cliente %<input name="tan" defaultValue={t?.tan ?? 0} className={input} /></label>
      <label className="text-xs font-semibold text-neutral-700">Spese incasso a rata €<input name="speseIncassoRata" defaultValue={t?.speseIncassoRata ?? 1.5} className={input} /></label>
      <label className="text-xs font-semibold text-neutral-700 col-span-2">Tasso di rendimento % (per il costo a noi)<input name="tassoRendimento" defaultValue={t?.tassoRendimento ?? 6.5} className={input} /></label>
    </div>
  );
}

export default async function FinanziamentiPage({ searchParams }: { searchParams: Promise<{ ok?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u || !(u.ruolo === "AMMINISTRATORE" || puo(u, "amministrazione"))) notFound();
  const { ok, errore } = await searchParams;
  const tabelle = await leggiTabelleFinanziamento();
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Link href="/impostazioni" className="btn-indietro">← Impostazioni</Link>
        <h1 className="text-2xl font-extrabold text-neutral-900">🏦 Tabelle di finanziamento</h1>
        <p className="text-sm text-neutral-600">
          Sono le tabelle che il commerciale sceglie nell&apos;offerta («Pagamento con finanziamento»). Si copiano dal simulatore della finanziaria:
          il TAN è quello che paga il cliente, il tasso di rendimento serve a calcolare quanto costa a noi il finanziamento.
          Le offerte già fatte si ricalcolano con i valori nuovi.
        </p>
      </div>
      {ok && <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">{ok}</p>}
      {errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{errore}</p>}
      {tabelle.map((t) => (
        <details key={t.id} className="rounded-lg border border-neutral-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-neutral-900">
            {t.nome} <span className="font-normal text-neutral-500">· {t.importoMin}–{t.importoMax} € · {t.rateDa === t.rateA ? `${t.rateA} rate` : `${t.rateDa}–${t.rateA} rate`} · TAN {t.tan}%</span>
          </summary>
          <div className="px-4 pb-4">
            <form action={salvaTabellaFinanziamento} className="space-y-2">
              <Campi t={t} />
              <button className="btn-3d btn-3d-green text-sm px-3 py-1.5">💾 Salva</button>
            </form>
            <form action={eliminaTabellaFinanziamento} className="mt-2">
              <input type="hidden" name="id" value={t.id} />
              <button className="btn-3d btn-3d-red text-xs px-2 py-1">🗑 Elimina questa tabella</button>
            </form>
          </div>
        </details>
      ))}
      {tabelle.length === 0 && <p className="text-sm text-neutral-600">Nessuna tabella: nelle offerte non si può scegliere nessun finanziamento.</p>}
      <details className="rounded-lg border border-neutral-300 bg-white" open={tabelle.length === 0}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-neutral-900">➕ Aggiungi una tabella</summary>
        <form action={salvaTabellaFinanziamento} className="space-y-2 px-4 pb-4">
          <Campi />
          <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5">Aggiungi</button>
        </form>
      </details>
      <form action={ripristinaTabelleFinanziamento}>
        <button className="btn-3d btn-3d-outline text-xs px-2 py-1">↺ Ripristina le tabelle del simulatore</button>
      </form>
    </div>
  );
}
