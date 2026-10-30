export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoGestireOrdini } from "@/lib/ordini/server";
import { salvaFornitoreModelli } from "@/app/ordini-actions";

type P = { brand?: string; famiglia?: string; gruppo?: string; senza?: string; q?: string; fatto?: string };
// Oltre questo numero di modelli mostrati la modifica riga per riga si nasconde (pagina troppo pesante):
// si assegna per gruppo o si filtra.
const MAX_RIGHE = 250;
const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";

export default async function FornitoriProdottiPage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u || !puoGestireOrdini(u)) notFound();
  const p = await searchParams;
  const [brands, fornitori] = await Promise.all([
    prisma.brand.findMany({ orderBy: { nome: "asc" } }),
    prisma.soggetto.findMany({ where: { attivo: true, ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" }, select: { id: true, ragioneSociale: true, scontoFornitore: true } }),
  ]);
  const brand = brands.find((b) => b.id === p.brand) ?? brands.find((b) => b.nome === "P&C") ?? brands[0];
  const modelli = brand ? await prisma.modelloProdotto.findMany({
    where: { brandId: brand.id, ...(p.senza ? { fornitoreId: null } : {}), ...(p.q ? { tipologia: { contains: p.q, mode: "insensitive" } } : {}) },
    select: { id: true, tipologia: true, famiglia: true, gruppo: true, fornitoreId: true, codiceFornitore: true, scontoAcquisto: true },
    orderBy: [{ famiglia: "asc" }, { gruppo: "asc" }, { tipologia: "asc" }],
  }) : [];
  const famiglia = (m: { famiglia: string | null; gruppo: string | null }) => m.famiglia ?? m.gruppo ?? "Altro";
  const gruppo = (m: { famiglia: string | null; gruppo: string | null }) => m.gruppo ?? m.famiglia ?? "Altro";
  const famiglie = [...new Set(modelli.map(famiglia))];
  const gruppiDisponibili = [...new Set(modelli.filter((m) => !p.famiglia || famiglia(m) === p.famiglia).map(gruppo))].sort();
  const visibili = modelli.filter((m) => (!p.famiglia || famiglia(m) === p.famiglia) && (!p.gruppo || gruppo(m) === p.gruppo));
  const nomeForn = (id?: string | null) => fornitori.find((f) => f.id === id);
  const qs = (x: Partial<P>) => `?${new URLSearchParams(Object.entries({ ...p, ...x }).filter(([, v]) => v) as [string, string][])}`;
  const pill = (a: boolean) => `px-2.5 py-1 rounded-full text-xs border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300"}`;
  // sezioni per gruppo (Blindati, Cancelli, Zanzariere…): la famiglia (INDOOR/OUTDOOR) è troppo grande
  const gruppi = [...new Set(visibili.map((m) => `${famiglia(m)} › ${gruppo(m)}`))].sort().map((f) => ({ f, lista: visibili.filter((m) => `${famiglia(m)} › ${gruppo(m)}` === f) }));
  const rigaPerRiga = visibili.length <= MAX_RIGHE;
  const opzioniFornitori = fornitori.map((x) => <option key={x.id} value={x.id}>{x.ragioneSociale}</option>);
  const assegnati = modelli.filter((m) => m.fornitoreId).length;
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div>
        <Link href="/prodotti" className="text-sm text-blue-800 underline">← Prodotti & listini</Link>
        <h1 className="text-2xl font-bold text-neutral-900">Fornitori dei prodotti</h1>
        <p className="text-sm text-neutral-600">A chi si ordina ogni modello del listino. Serve a compilare da solo il fornitore nelle commesse e a stimare il costo: <b>listino − sconto d&apos;acquisto</b> (se lo sconto del modello è vuoto vale quello del fornitore in anagrafica). {brand?.nome}: {assegnati} modelli su {modelli.length} hanno il fornitore.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">{brands.map((b) => <Link key={b.id} href={`?brand=${b.id}`} className={pill(b.id === brand?.id)}>{b.nome}</Link>)}</div>
      <form className="flex flex-wrap gap-2 items-center">
        <input type="hidden" name="brand" value={brand?.id ?? ""} />
        <select name="famiglia" defaultValue={p.famiglia ?? ""} className={inp}><option value="">Tutte le famiglie</option>{famiglie.map((f) => <option key={f}>{f}</option>)}</select>
        <select name="gruppo" defaultValue={p.gruppo ?? ""} className={inp}><option value="">Tutti i gruppi</option>{gruppiDisponibili.map((g) => <option key={g}>{g}</option>)}</select>
        <input name="q" defaultValue={p.q} placeholder="Cerca modello…" className={inp} />
        <label className="text-sm flex items-center gap-1"><input type="checkbox" name="senza" value="1" defaultChecked={!!p.senza} /> solo senza fornitore</label>
        <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5">Filtra</button>
        {(p.famiglia || p.gruppo || p.q || p.senza) && <Link href={qs({ famiglia: undefined, gruppo: undefined, q: undefined, senza: undefined, fatto: undefined })} className="text-sm underline">azzera</Link>}
      </form>
      {p.fatto && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ Salvato: {p.fatto}</p>}
      {visibili.length > 0 && (
        <form action={salvaFornitoreModelli} className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-purple-300 bg-purple-50 p-3">
          {visibili.map((m) => <input key={m.id} type="hidden" name="modelloId" value={m.id} />)}
          <input type="hidden" name="ritorno" value={qs({ fatto: undefined })} />
          <span className="text-sm font-semibold">Assegna a tutti i {visibili.length} modelli mostrati:</span>
          <select name="fornitoreId" required className={inp} defaultValue=""><option value="" disabled>scegli il fornitore…</option>{opzioniFornitori}<option value="__nessuno__">— togli il fornitore —</option></select>
          <button className="btn-3d btn-3d-purple text-sm px-3 py-1.5">Assegna a tutti</button>
          <span className="text-xs text-neutral-600">Suggerimento: cerca il nome (es. &quot;BLINDATI&quot;) o scegli il gruppo, poi assegna in un colpo.</span>
        </form>
      )}
      {!rigaPerRiga && <p className="text-sm text-neutral-600">Sono mostrati {visibili.length} modelli: per modificarli uno per uno (codice e sconto) scegli un gruppo o cerca un nome. Puoi già assegnare il fornitore a ogni gruppo qui sotto.</p>}
      {gruppi.map(({ f, lista }) => (
        <section key={f} className="bg-white border border-neutral-200 rounded-lg p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="font-bold">{f} <span className="text-xs font-normal text-neutral-500">({lista.length} modelli, {lista.filter((m) => m.fornitoreId).length} con fornitore{[...new Set(lista.map((m) => nomeForn(m.fornitoreId)?.ragioneSociale).filter(Boolean))].length === 1 && lista.every((m) => m.fornitoreId) ? `: ${nomeForn(lista[0].fornitoreId)?.ragioneSociale}` : ""})</span></h2>
            <form action={salvaFornitoreModelli} className="flex items-center gap-2">
              {lista.map((m) => <input key={m.id} type="hidden" name="modelloId" value={m.id} />)}
              <input type="hidden" name="ritorno" value={qs({ fatto: undefined })} />
              <select name="fornitoreId" required className={inp} defaultValue=""><option value="" disabled>scegli il fornitore…</option>{opzioniFornitori}<option value="__nessuno__">— togli il fornitore —</option></select>
              <button className="btn-3d btn-3d-purple text-xs px-2 py-1">Assegna a tutto il gruppo</button>
            </form>
          </div>
          {rigaPerRiga && <div className="divide-y divide-neutral-100">
            {lista.map((m) => (
              // la chiave cambia col salvataggio: la riga si ridisegna con i valori salvati (prima la tendina tornava indietro)
              <form key={`${m.id}-${m.fornitoreId}-${m.codiceFornitore}-${m.scontoAcquisto}`} action={salvaFornitoreModelli} className="flex flex-wrap items-center gap-2 py-1.5">
                <input type="hidden" name="modelloId" value={m.id} />
                <input type="hidden" name="ritorno" value={qs({ fatto: undefined })} />
                <span className="text-sm w-64 truncate" title={m.tipologia}>{m.tipologia.replace(/_/g, " ")}</span>
                <select name="fornitoreId" defaultValue={m.fornitoreId ?? ""} className={`${inp} w-56`}><option value="">— nessuno —</option>{opzioniFornitori}</select>
                <input name="codiceFornitore" defaultValue={m.codiceFornitore ?? ""} placeholder="Cod. fornitore" className={`${inp} w-32`} />
                <input name="scontoAcquisto" defaultValue={m.scontoAcquisto ?? ""} placeholder={`sconto % (${nomeForn(m.fornitoreId)?.scontoFornitore ?? "—"})`} className={`${inp} w-36`} />
                <button className="text-xs btn-3d btn-3d-blue px-2 py-1">salva</button>
                {m.fornitoreId && <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-800">✓ {nomeForn(m.fornitoreId)?.ragioneSociale}</span>}
              </form>
            ))}
          </div>}
        </section>
      ))}
      {!gruppi.length && <p className="text-sm text-neutral-500">Nessun modello con questi filtri.</p>}
    </div>
  );
}
