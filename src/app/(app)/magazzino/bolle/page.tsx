export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STATI_BOLLA, statoBolla, numeroBolla, CAUSALI_BOLLA } from "@/lib/magazzino/calcoli";
import { creaBolla } from "@/app/magazzino-actions";

type P = { stato?: string; fornitore?: string; q?: string; anno?: string; nuova?: string };
const dataIt = (d?: Date | null) => (d ? d.toLocaleDateString("it-IT") : "—");
const oggi = () => new Date().toISOString().slice(0, 10);
const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

export default async function BollePage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const anno = Number(p.anno) || new Date().getFullYear();
  const where: Prisma.BollaEntrataWhereInput = { anno };
  if (p.stato && STATI_BOLLA[p.stato]) where.stato = p.stato;
  if (p.fornitore) where.fornitoreId = p.fornitore;
  if (p.q?.trim()) {
    const q = p.q.trim(); const n = Number(q.split("/")[0]);
    where.OR = [...(Number.isInteger(n) && n > 0 ? [{ numero: n }] : []), { numeroDdt: { contains: q, mode: "insensitive" } }, { fornitoreNome: { contains: q, mode: "insensitive" } }, { riferimento: { contains: q, mode: "insensitive" } }, { righe: { some: { descrizione: { contains: q, mode: "insensitive" } } } }];
  }
  const [bolle, fornitori, conteggi] = await Promise.all([
    prisma.bollaEntrata.findMany({ where, include: { righe: { select: { esito: true, commessaId: true, destinazione: true } }, fatturaAcquisto: { select: { numero: true } } }, orderBy: [{ anno: "desc" }, { numero: "desc" }], take: 300 }),
    prisma.soggetto.findMany({ where: { attivo: true, ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" }, select: { id: true, ragioneSociale: true } }),
    prisma.bollaEntrata.groupBy({ by: ["stato"], where: { anno }, _count: true }),
  ]);
  const n = (s: string) => conteggi.find((c) => c.stato === s)?._count ?? 0;
  const qs = (x: Partial<P>) => { const o = { ...p, ...x }; return `?${new URLSearchParams(Object.entries(o).filter(([k, v]) => v && k !== "nuova") as [string, string][])}`; };
  const pill = (a: boolean) => `px-2.5 py-1 rounded-full text-xs border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`;
  return (
    <div className="space-y-4">
      <details className="bg-white border border-green-300 rounded-lg p-4" open={!!p.nuova || bolle.length === 0}>
        <summary className="cursor-pointer font-bold text-green-900">+ Registra una bolla in arrivo</summary>
        <form action={creaBolla} className="grid md:grid-cols-6 gap-2 mt-3 items-end">
          <label className="text-xs font-semibold md:col-span-2">Fornitore
            <select name="fornitoreId" className={`${inp} w-full`} defaultValue=""><option value="">— scegli —</option>{fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}</select></label>
          <label className="text-xs font-semibold md:col-span-2">…oppure fornitore non in anagrafica<input name="fornitoreNome" className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold">N° DDT fornitore<input name="numeroDdt" className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold">Data DDT<input type="date" name="dataDdt" className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold">Arrivata il<input type="date" name="dataArrivo" defaultValue={oggi()} className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold">Causale<select name="causale" className={`${inp} w-full`}>{Object.entries(CAUSALI_BOLLA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-xs font-semibold md:col-span-3">Riferimento / note<input name="riferimento" className={`${inp} w-full`} placeholder="es. consegna parziale, colli 3" /></label>
          <button className="btn-3d btn-3d-green text-sm px-3 py-1.5">Crea e spunta le righe →</button>
        </form>
        <p className="text-xs text-neutral-500 mt-2">Nella pagina della bolla aggiungi le righe dagli ordini aperti del fornitore (o falla leggere all&apos;AI dalla foto) e spunti cosa è arrivato.</p>
      </details>

      <div className="flex flex-wrap gap-1.5 items-center">
        <Link href={qs({ stato: undefined })} className={pill(!p.stato)}>Tutte</Link>
        {Object.entries(STATI_BOLLA).map(([k, s]) => <Link key={k} href={qs({ stato: k })} className={pill(p.stato === k)}>{s.nome} ({n(k)})</Link>)}
      </div>
      <form className="flex flex-wrap gap-2 items-end">
        {p.stato && <input type="hidden" name="stato" value={p.stato} />}
        <select name="fornitore" defaultValue={p.fornitore ?? ""} className={inp}><option value="">Tutti i fornitori</option>{fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}</select>
        <input name="q" defaultValue={p.q ?? ""} placeholder="N°, DDT, fornitore, articolo…" className={inp} />
        <select name="anno" defaultValue={String(anno)} className={inp}>{[0, 1, 2].map((i) => <option key={i}>{new Date().getFullYear() - i}</option>)}</select>
        <button className="btn-3d btn-3d-dark text-sm px-3 py-1.5">Filtra</button>
      </form>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50"><th className="p-2">N°</th><th>Arrivo</th><th>Fornitore</th><th>DDT</th><th>Causale</th><th>Righe</th><th>Riferimento</th><th>Stato</th></tr></thead>
          <tbody>
            {bolle.map((b) => {
              const s = statoBolla(b.stato);
              const problemi = b.righe.filter((r) => ["MANCANTE", "DANNEGGIATO", "PARZIALE"].includes(r.esito)).length;
              return (
                <tr key={b.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="p-2 font-semibold"><Link href={`/magazzino/bolle/${b.id}`} className="text-blue-800 underline">{numeroBolla(b)}</Link></td>
                  <td>{dataIt(b.dataArrivo)}</td>
                  <td>{b.fornitoreNome}</td>
                  <td>{b.numeroDdt ?? "—"}{b.dataDdt ? <span className="text-xs text-neutral-500"> del {dataIt(b.dataDdt)}</span> : null}</td>
                  <td className="text-xs">{CAUSALI_BOLLA[b.causale] ?? b.causale}</td>
                  <td className="text-xs">{b.righe.length}{problemi ? <span className="text-red-700"> · {problemi} con problemi</span> : null}{b.righe.some((r) => r.destinazione === "MAGAZZINO") ? " · scorta" : ""}</td>
                  <td className="text-xs max-w-64 truncate">{b.riferimento ?? ""}</td>
                  <td><span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: s.colore }}>{s.nome}</span>{b.fatturaAcquisto ? <span className="block text-[11px] text-neutral-500">ft. {b.fatturaAcquisto.numero}</span> : null}</td>
                </tr>
              );
            })}
            {bolle.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-neutral-500">Nessuna bolla.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
