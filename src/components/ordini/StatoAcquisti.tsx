import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { numeroOrdine, statoOrdine } from "@/lib/ordini/calcoli";
import { creaOrdineDaCommessa, applicaFornitoriPredefiniti } from "@/app/ordini-actions";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });

/** Stato acquisti della commessa: righe raggruppate per fornitore, costi previsti/effettivi e ordini. */
export default async function StatoAcquisti({ commessaId, puoGestire }: { commessaId: string; puoGestire: boolean }) {
  const [righe, ordini] = await Promise.all([
    prisma.rigaOrdine.findMany({ where: { commessaId }, include: { ordineFornitore: { select: { id: true, numero: true, anno: true, stato: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.ordineFornitore.findMany({ where: { commessaId }, include: { fornitore: { select: { ragioneSociale: true } }, righe: { select: { arrivato: true } } }, orderBy: [{ anno: "asc" }, { numero: "asc" }] }),
  ]);
  if (!righe.length && !ordini.length) return null;
  const prev = await prisma.rigaPreventivo.findMany({ where: { id: { in: righe.map((r) => r.rigaPreventivoId).filter(Boolean) as string[] } }, select: { id: true, prezzoUnitario: true, optionalPrezzo: true, quantita: true } });
  const vendita = (rid: string | null) => { const p = prev.find((x) => x.id === rid); return p ? (p.prezzoUnitario + p.optionalPrezzo) * p.quantita : 0; };
  const gruppi = new Map<string, { nome: string; fornitoreId: string | null; righe: typeof righe }>();
  for (const r of righe) {
    const k = r.fornitoreId ?? "-";
    const g = gruppi.get(k) ?? { nome: r.fornitoreNome ?? "Senza fornitore", fornitoreId: r.fornitoreId, righe: [] };
    g.righe.push(r); gruppi.set(k, g);
  }
  const lista = [...gruppi.values()].sort((a, b) => (a.fornitoreId ? 0 : 1) - (b.fornitoreId ? 0 : 1) || a.nome.localeCompare(b.nome));
  const tot = { vendita: 0, previsto: 0, effettivo: 0, senzaStima: 0 };
  for (const r of righe) { tot.vendita += vendita(r.rigaPreventivoId); if (r.costoPrevisto !== null) tot.previsto += r.costoPrevisto; else tot.senzaStima++; tot.effettivo += r.costoEffettivo ?? 0; }
  const margPrev = tot.vendita - tot.previsto;
  return (
    <div id="acquisti" className="border border-orange-200 rounded-lg p-3 mb-4 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-sm font-bold text-neutral-900">Stato acquisti</p>
        {puoGestire && righe.some((r) => !r.ordineFornitoreId && (!r.fornitoreId || r.costoPrevisto === null)) && (
          <form action={applicaFornitoriPredefiniti}><input type="hidden" name="commessaId" value={commessaId} /><button className="text-xs text-blue-800 underline">Applica fornitori e costi predefiniti dal listino</button></form>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
        <div className="rounded border border-neutral-200 p-2">Venduto (listino righe)<br /><b className="text-sm">{eur(tot.vendita)}</b></div>
        <div className="rounded border border-neutral-200 p-2">Costo previsto<br /><b className="text-sm">{eur(tot.previsto)}</b>{tot.senzaStima ? <span className="text-amber-700"> · {tot.senzaStima} righe senza stima</span> : null}</div>
        <div className="rounded border border-neutral-200 p-2">Margine previsto<br /><b className={`text-sm ${margPrev < 0 ? "text-red-700" : "text-green-800"}`}>{eur(margPrev)}</b>{tot.vendita ? ` (${((margPrev / tot.vendita) * 100).toFixed(0)}%)` : ""}</div>
        <div className="rounded border border-neutral-200 p-2">Costo effettivo registrato<br /><b className="text-sm">{eur(tot.effettivo)}</b></div>
      </div>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-neutral-600 border-b border-neutral-200"><th className="py-1">Fornitore</th><th>Righe</th><th className="text-right">Venduto</th><th className="text-right">Costo previsto</th><th>Stato</th><th></th></tr></thead>
        <tbody>
          {lista.map((g) => {
            const libere = g.righe.filter((r) => !r.ordineFornitoreId && !r.ordinato);
            const inOrdine = [...new Map(g.righe.filter((r) => r.ordineFornitore).map((r) => [r.ordineFornitore!.id, r.ordineFornitore!])).values()];
            const arrivate = g.righe.filter((r) => r.arrivato).length;
            const prevG = g.righe.reduce((t, r) => t + (r.costoPrevisto ?? 0), 0);
            return (
              <tr key={g.nome} className="border-b border-neutral-100 align-top">
                <td className={`py-1.5 font-medium ${g.fornitoreId ? "" : "text-amber-800"}`}>{g.nome}</td>
                <td>{g.righe.length}{arrivate ? ` · ${arrivate} arrivate` : ""}</td>
                <td className="text-right">{eur(g.righe.reduce((t, r) => t + vendita(r.rigaPreventivoId), 0))}</td>
                <td className="text-right">{prevG ? eur(prevG) : "—"}</td>
                <td>
                  {inOrdine.map((o) => <Link key={o.id} href={`/ordini-fornitori/${o.id}`} className="block underline" style={{ color: statoOrdine(o.stato).colore }}>Ordine {numeroOrdine(o)} · {statoOrdine(o.stato).nome}</Link>)}
                  {libere.length > 0 && <span className="text-amber-800">{libere.length} da ordinare</span>}
                  {!g.fornitoreId && <span className="block text-amber-800">scegli il fornitore nelle righe qui sotto</span>}
                </td>
                <td className="text-right">
                  {puoGestire && g.fornitoreId && libere.length > 0 && (
                    <form action={creaOrdineDaCommessa}><input type="hidden" name="commessaId" value={commessaId} /><input type="hidden" name="fornitoreId" value={g.fornitoreId} /><button className="btn-3d btn-3d-purple text-[11px] px-2 py-1">Crea ordine ({libere.length})</button></form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {ordini.some((o) => o.stato === "ANNULLATO") && <p className="text-[11px] text-neutral-500 mt-1">Ordini annullati: {ordini.filter((o) => o.stato === "ANNULLATO").map((o) => numeroOrdine(o)).join(", ")}</p>}
    </div>
  );
}
