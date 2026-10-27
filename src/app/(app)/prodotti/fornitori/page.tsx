export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoGestireOrdini } from "@/lib/ordini/server";
import { salvaFornitoreModelli } from "@/app/ordini-actions";

type P = { brand?: string; famiglia?: string; senza?: string; q?: string };
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
  const famiglie = [...new Set(modelli.map((m) => m.famiglia ?? m.gruppo ?? "Altro"))];
  const visibili = p.famiglia ? modelli.filter((m) => (m.famiglia ?? m.gruppo ?? "Altro") === p.famiglia) : modelli;
  const nomeForn = (id?: string | null) => fornitori.find((f) => f.id === id);
  const qs = (x: Partial<P>) => `?${new URLSearchParams(Object.entries({ ...p, ...x }).filter(([, v]) => v) as [string, string][])}`;
  const pill = (a: boolean) => `px-2.5 py-1 rounded-full text-xs border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300"}`;
  const gruppi = famiglie.filter((f) => !p.famiglia || f === p.famiglia).map((f) => ({ f, lista: visibili.filter((m) => (m.famiglia ?? m.gruppo ?? "Altro") === f) })).filter((g) => g.lista.length);
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
        <input name="q" defaultValue={p.q} placeholder="Cerca modello…" className={inp} />
        <label className="text-sm flex items-center gap-1"><input type="checkbox" name="senza" value="1" defaultChecked={!!p.senza} /> solo senza fornitore</label>
        <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5">Filtra</button>
        {(p.famiglia || p.q || p.senza) && <Link href={qs({ famiglia: undefined, q: undefined, senza: undefined })} className="text-sm underline">azzera</Link>}
      </form>
      {gruppi.map(({ f, lista }) => (
        <section key={f} className="bg-white border border-neutral-200 rounded-lg p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="font-bold">{f} <span className="text-xs font-normal text-neutral-500">({lista.length} modelli)</span></h2>
            <form action={salvaFornitoreModelli} className="flex items-center gap-2">
              {lista.map((m) => <input key={m.id} type="hidden" name="modelloId" value={m.id} />)}
              <select name="fornitoreId" className={inp} defaultValue=""><option value="">— nessuno —</option>{fornitori.map((x) => <option key={x.id} value={x.id}>{x.ragioneSociale}</option>)}</select>
              <button className="btn-3d btn-3d-purple text-xs px-2 py-1">Assegna a tutta la famiglia</button>
            </form>
          </div>
          <div className="divide-y divide-neutral-100">
            {lista.map((m) => (
              <form key={m.id} action={salvaFornitoreModelli} className="flex flex-wrap items-center gap-2 py-1.5">
                <input type="hidden" name="modelloId" value={m.id} />
                <span className="text-sm w-64 truncate" title={m.tipologia}>{m.tipologia.replace(/_/g, " ")}</span>
                <select name="fornitoreId" defaultValue={m.fornitoreId ?? ""} className={`${inp} w-56`}><option value="">— nessuno —</option>{fornitori.map((x) => <option key={x.id} value={x.id}>{x.ragioneSociale}</option>)}</select>
                <input name="codiceFornitore" defaultValue={m.codiceFornitore ?? ""} placeholder="Cod. fornitore" className={`${inp} w-32`} />
                <input name="scontoAcquisto" defaultValue={m.scontoAcquisto ?? ""} placeholder={`sconto % (${nomeForn(m.fornitoreId)?.scontoFornitore ?? "—"})`} className={`${inp} w-36`} />
                <button className="text-xs btn-3d btn-3d-blue px-2 py-1">salva</button>
              </form>
            ))}
          </div>
        </section>
      ))}
      {!gruppi.length && <p className="text-sm text-neutral-500">Nessun modello con questi filtri.</p>}
    </div>
  );
}
