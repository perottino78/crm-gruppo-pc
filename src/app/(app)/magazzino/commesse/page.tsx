export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { riepilogoMateriale } from "@/lib/magazzino/calcoli";
import { numeroCommessa, STATI_COMMESSA } from "@/lib/commesse";

type P = { vista?: string };

/** Stato del materiale di ogni commessa aperta: quanto è arrivato, cosa manca, quali sono pronte. */
export default async function MaterialeCommessePage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const commesse = await prisma.commessa.findMany({
    where: { stato: { notIn: ["CHIUSA", "ANNULLATA", "LAVORI_ESEGUITI"] }, righeOrdine: { some: {} } },
    include: { cliente: { select: { nome: true } }, righeOrdine: { select: { arrivato: true, ordinato: true, ordineFornitoreId: true, daMagazzino: true, quantita: true, quantitaArrivata: true } } },
    orderBy: [{ anno: "desc" }, { numero: "desc" }],
  });
  const voci = commesse.map((c) => ({ c, r: riepilogoMateriale(c.righeOrdine) }))
    .filter(({ r }) => (p.vista === "pronte" ? r.completo : p.vista === "mancanti" ? !r.completo : true))
    .sort((a, b) => Number(b.r.completo) - Number(a.r.completo) || b.r.percentuale - a.r.percentuale);
  const pill = (a: boolean) => `px-2.5 py-1 rounded-full text-xs border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`;
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <Link href="?" className={pill(!p.vista)}>Tutte ({commesse.length})</Link>
        <Link href="?vista=pronte" className={pill(p.vista === "pronte")}>Materiale completo</Link>
        <Link href="?vista=mancanti" className={pill(p.vista === "mancanti")}>Con materiale mancante</Link>
      </div>
      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50"><th className="p-2">Commessa</th><th>Stato</th><th className="w-48">Materiale</th><th>Da ordinare</th><th>In arrivo</th><th>Da prelevare</th><th>Saldo</th></tr></thead>
          <tbody>
            {voci.map(({ c, r }) => (
              <tr key={c.id} className={`border-b border-neutral-100 ${r.completo ? "bg-green-50" : ""}`}>
                <td className="p-2"><Link href={`/commesse/${c.id}#materiale`} className="text-blue-800 underline font-medium">{numeroCommessa(c)}</Link> {c.cliente.nome}</td>
                <td className="text-xs">{STATI_COMMESSA[c.stato]?.label ?? c.stato}</td>
                <td><div className="h-2 bg-neutral-200 rounded"><div className={`h-2 rounded ${r.completo ? "bg-green-600" : "bg-amber-500"}`} style={{ width: `${r.percentuale}%` }} /></div><span className="text-[11px] text-neutral-600">{r.arrivate}/{r.tot} righe{r.parziali ? ` · ${r.parziali} parziali` : ""}{r.completo ? " · completo" : ""}</span></td>
                <td className={r.daOrdinare ? "text-amber-800 font-semibold" : "text-neutral-400"}>{r.daOrdinare}</td>
                <td>{r.inArrivo || "—"}</td>
                <td>{r.daPrelevare || "—"}</td>
                <td className="text-xs">{c.saldoIncassato ? "incassato" : "da incassare"}</td>
              </tr>
            ))}
            {voci.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-neutral-500">Nessuna commessa.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
