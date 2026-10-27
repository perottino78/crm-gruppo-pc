export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoGestireOrdini } from "@/lib/ordini/server";
import { STATI_ORDINE, statoOrdine, numeroOrdine, totaleOrdine } from "@/lib/ordini/calcoli";
import { creaOrdineLibero } from "@/app/ordini-actions";
import { BRANDS } from "@/lib/brands";

type P = { stato?: string; fornitore?: string; q?: string; anno?: string };
const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });
const dataIt = (d?: Date | null) => (d ? d.toLocaleDateString("it-IT") : "—");

export default async function OrdiniFornitoriPage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u || !puoGestireOrdini(u)) notFound();
  const p = await searchParams;
  const anno = Number(p.anno) || new Date().getFullYear();
  const where: Prisma.OrdineFornitoreWhereInput = { anno };
  if (p.stato === "APERTI") where.stato = { in: ["BOZZA", "INVIATO", "CONFERMATO", "EVASO_PARZIALE"] };
  else if (p.stato && STATI_ORDINE.some((s) => s.chiave === p.stato)) where.stato = p.stato;
  if (p.fornitore) where.fornitoreId = p.fornitore;
  if (p.q?.trim()) {
    const q = p.q.trim();
    const n = Number(q.split("/")[0]);
    where.OR = [
      ...(Number.isInteger(n) && n > 0 ? [{ numero: n }] : []),
      { fornitore: { ragioneSociale: { contains: q, mode: "insensitive" } } },
      { clienteFinale: { contains: q, mode: "insensitive" } },
      { riferimento: { contains: q, mode: "insensitive" } },
      { numeroConfermaFornitore: { contains: q, mode: "insensitive" } },
    ];
  }
  const [ordini, fornitori, conteggi, daOrdinare] = await Promise.all([
    prisma.ordineFornitore.findMany({ where, include: { fornitore: true, commessa: true, righe: { select: { arrivato: true, quantita: true, prezzoAcquisto: true, scontoAcquisto: true } } }, orderBy: [{ anno: "desc" }, { numero: "desc" }], take: 300 }),
    prisma.soggetto.findMany({ where: { attivo: true, ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" }, select: { id: true, ragioneSociale: true } }),
    prisma.ordineFornitore.groupBy({ by: ["stato"], where: { anno }, _count: true }),
    prisma.rigaOrdine.findMany({ where: { ordineFornitoreId: null, ordinato: false, commessaId: { not: null }, commessa: { stato: { notIn: ["CHIUSA", "ANNULLATA"] } } }, select: { commessaId: true, fornitoreId: true, fornitoreNome: true, commessa: { select: { numero: true, anno: true, cliente: { select: { nome: true } } } } } }),
  ]);
  const n = (s: string) => conteggi.find((c) => c.stato === s)?._count ?? 0;
  const aperti = ["BOZZA", "INVIATO", "CONFERMATO", "EVASO_PARZIALE"].reduce((t, s) => t + n(s), 0);
  const qs = (x: Partial<P>) => { const o = { ...p, ...x }; const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]); return `?${s}`; };
  const pill = (attivo: boolean) => `px-2.5 py-1 rounded-full text-xs border ${attivo ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`;
  // commesse con righe da ordinare, raggruppate per commessa
  const perCommessa = new Map<string, { titolo: string; senzaFornitore: number; fornitori: Set<string> }>();
  for (const r of daOrdinare) {
    const k = r.commessaId!;
    const x = perCommessa.get(k) ?? { titolo: `${r.commessa!.numero}/${r.commessa!.anno} · ${r.commessa!.cliente.nome}`, senzaFornitore: 0, fornitori: new Set<string>() };
    if (r.fornitoreId) x.fornitori.add(r.fornitoreNome ?? "?"); else x.senzaFornitore++;
    perCommessa.set(k, x);
  }
  const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">🚚 Ordini fornitori</h1>
          <p className="text-sm text-neutral-600">Anno {anno}: {aperti} aperti · {n("EVASO")} arrivati · {n("ANNULLATO")} annullati</p>
        </div>
        <form action={creaOrdineLibero} className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold">Nuovo ordine senza commessa (scorta, consumabili)
            <select name="fornitoreId" required className={`${inp} block`}><option value="">Fornitore…</option>{fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}</select>
          </label>
          <select name="divisione" className={inp} defaultValue="P&C">{BRANDS.map((b) => <option key={b.nome}>{b.nome}</option>)}</select>
          <button className="btn-3d btn-3d-purple text-sm px-3 py-1.5">+ Crea</button>
        </form>
      </div>

      {perCommessa.size > 0 && (
        <details className="bg-amber-50 border border-amber-200 rounded-lg p-3" open>
          <summary className="cursor-pointer text-sm font-semibold text-amber-900">Da ordinare: {perCommessa.size} commesse con righe non ancora in un ordine</summary>
          <ul className="mt-2 grid md:grid-cols-2 gap-1 text-sm">
            {[...perCommessa.entries()].slice(0, 40).map(([id, x]) => (
              <li key={id}><Link href={`/commesse/${id}#acquisti`} className="text-blue-800 underline">{x.titolo}</Link>
                <span className="text-xs text-neutral-700"> — {[...x.fornitori].join(", ")}{x.senzaFornitore ? `${x.fornitori.size ? " · " : ""}${x.senzaFornitore} righe senza fornitore` : ""}</span></li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-1.5 items-center">
        <Link href={qs({ stato: undefined })} className={pill(!p.stato)}>Tutti</Link>
        <Link href={qs({ stato: "APERTI" })} className={pill(p.stato === "APERTI")}>Aperti ({aperti})</Link>
        {STATI_ORDINE.map((s) => <Link key={s.chiave} href={qs({ stato: s.chiave })} className={pill(p.stato === s.chiave)}>{s.nome} ({n(s.chiave)})</Link>)}
      </div>
      <form className="flex flex-wrap gap-2 items-end">
        {p.stato && <input type="hidden" name="stato" value={p.stato} />}
        <input name="q" defaultValue={p.q} placeholder="Cerca n°, fornitore, cliente, riferimento, conferma…" className={`${inp} w-72`} />
        <select name="fornitore" defaultValue={p.fornitore ?? ""} className={inp}><option value="">Tutti i fornitori</option>{fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}</select>
        <input name="anno" type="number" defaultValue={anno} className={`${inp} w-24`} />
        <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5">Filtra</button>
      </form>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50">
            <th className="p-2">N.</th><th>Data</th><th>Fornitore</th><th>Commessa / cliente</th><th>Consegna</th><th>Arrivi</th><th className="text-right">Totale</th><th className="p-2">Stato</th>
          </tr></thead>
          <tbody>
            {ordini.map((o) => {
              const s = statoOrdine(o.stato);
              const arr = o.righe.filter((r) => r.arrivato).length;
              const t = totaleOrdine(o.righe);
              const ritardo = !["EVASO", "ANNULLATO"].includes(o.stato) && (o.consegnaConfermata ?? o.consegnaRichiesta) && (o.consegnaConfermata ?? o.consegnaRichiesta)! < new Date();
              return (
                <tr key={o.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="p-2 font-semibold"><Link href={`/ordini-fornitori/${o.id}`} className="text-blue-800 underline">{numeroOrdine(o)}</Link></td>
                  <td>{dataIt(o.dataOrdine)}</td>
                  <td>{o.fornitore.ragioneSociale}</td>
                  <td className="text-xs">{o.commessa ? <Link href={`/commesse/${o.commessaId}`} className="underline">{o.commessa.numero}/{o.commessa.anno}</Link> : <span className="text-neutral-500">scorta</span>} {o.clienteFinale?.split(" - ")[0]}</td>
                  <td className={`text-xs ${ritardo ? "text-red-700 font-semibold" : ""}`}>{o.consegnaConfermata ? `${dataIt(o.consegnaConfermata)} ✓` : dataIt(o.consegnaRichiesta)}{ritardo ? " ⚠" : ""}</td>
                  <td className="text-xs">{o.righe.length ? `${arr}/${o.righe.length}` : "—"}</td>
                  <td className="text-right text-xs">{t.totale ? eur(t.totale) : "—"}</td>
                  <td className="p-2"><span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: s.colore }}>{s.nome}</span></td>
                </tr>
              );
            })}
            {ordini.length === 0 && <tr><td colSpan={8} className="p-4 text-neutral-500">Nessun ordine con questi filtri.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
