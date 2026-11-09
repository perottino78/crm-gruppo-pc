export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STATI_DDT } from "@/lib/fatturazione/tabelle";
import { numeroDdt } from "@/lib/fatturazione/calcoli";
import { fatturaDaDdt } from "@/app/fatturazione-actions";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
type P = { stato?: string; anno?: string; q?: string; errore?: string };

/** Elenco DDT di uscita (come «Ddt uscita» di BConsole). Spuntando quelli di un cliente si crea la fattura differita. */
export default async function DdtPage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const anno = Number(p.anno) || new Date().getFullYear();
  const ddt = await prisma.ddtUscita.findMany({
    where: {
      anno, ...(p.stato ? { stato: p.stato } : {}),
      ...(p.q ? { OR: [{ clienteNome: { contains: p.q, mode: "insensitive" } }, { riferimento: { contains: p.q, mode: "insensitive" } }] } : {}),
    },
    include: { righe: { select: { prezzo: true, quantita: true, sconto: true } }, fattura: { select: { id: true, numero: true } } },
    orderBy: [{ numero: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], take: 500,
  });
  const qs = (x: Partial<P>) => `?${new URLSearchParams(Object.entries({ ...p, ...x, errore: undefined }).filter(([, v]) => v) as [string, string][])}`;
  const pill = (a: boolean) => `px-2.5 py-1 rounded-full text-xs border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`;
  return (
    <div className="space-y-3">
      {p.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{p.errore}</p>}
      <div className="flex flex-wrap gap-1.5 items-center">
        <Link href={qs({ stato: undefined })} className={pill(!p.stato)}>Tutti</Link>
        {Object.entries(STATI_DDT).map(([k, v]) => <Link key={k} href={qs({ stato: k })} className={pill(p.stato === k)}>{v.nome}</Link>)}
        <form className="ml-auto flex gap-2">
          {p.stato && <input type="hidden" name="stato" value={p.stato} />}
          <input name="q" defaultValue={p.q ?? ""} placeholder="Cliente, riferimento…" className="border border-neutral-300 rounded px-2 py-1 text-sm" />
          <input name="anno" type="number" defaultValue={anno} className="border border-neutral-300 rounded px-2 py-1 text-sm w-20" />
          <button className="btn-3d btn-3d-dark text-sm px-3 py-1">Filtra</button>
        </form>
      </div>
      <form action={fatturaDaDdt}>
        <input type="hidden" name="ritorno" value="/fatturazione/ddt" />
        <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50"><th className="p-2 w-8"></th><th>Numero</th><th>Data</th><th>Cliente</th><th>Causale</th><th>Riferimento</th><th className="text-right">Imponibile</th><th>Stato</th><th className="p-2">PDF</th></tr></thead>
            <tbody>
              {ddt.map((d) => (
                <tr key={d.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="p-2">{["DA_FATTURARE", "PARZ_FATTURATO"].includes(d.stato) && <input type="checkbox" name="ddtId" value={d.id} aria-label="Da fatturare" />}</td>
                  <td className="whitespace-nowrap"><Link href={`/fatturazione/ddt/${d.id}`} className="underline font-semibold">{numeroDdt(d)}</Link></td>
                  <td className="whitespace-nowrap">{dataIt(d.data)}</td>
                  <td>{d.clienteNome}</td>
                  <td className="text-xs">{d.causale}</td>
                  <td className="text-xs text-neutral-700">{d.riferimento ?? ""}</td>
                  <td className="text-right whitespace-nowrap">{eur(d.righe.reduce((t, r) => t + r.quantita * r.prezzo * (1 - (r.sconto ?? 0) / 100), 0))}</td>
                  <td className="text-xs"><span className="font-semibold" style={{ color: STATI_DDT[d.stato]?.colore }}>{STATI_DDT[d.stato]?.nome}</span>{d.fattura && <Link href={`/fatturazione/fatture/${d.fattura.id}`} className="block underline">{d.fattura.numero ?? "fattura in bozza"}</Link>}</td>
                  <td className="p-2"><a href={`/api/fatturazione/ddt/${d.id}/pdf`} target="_blank" rel="noreferrer" className="underline text-xs">PDF</a></td>
                </tr>
              ))}
              {ddt.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-neutral-500">Nessun DDT {p.stato ? "in questo stato" : `nel ${anno}`}. I nuovi si creano da «Da fatturare» o dalla commessa.</td></tr>}
            </tbody>
          </table>
        </div>
        <button className="btn-3d btn-3d-green text-sm px-4 py-2 mt-2">Crea la fattura dai DDT spuntati</button>
      </form>
    </div>
  );
}
