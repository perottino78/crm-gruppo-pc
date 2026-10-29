import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { riepilogoMateriale } from "@/lib/magazzino/calcoli";
import { giacenze } from "@/lib/magazzino/server";
import { numeroOrdine } from "@/lib/ordini/calcoli";
import { impegnaDaMagazzino, togliImpegno, prelevaDaMagazzino, annullaPrelievo, segnaArrivatoInCantiere } from "@/app/magazzino-actions";

const dataIt = (d?: Date | null) => (d ? d.toLocaleDateString("it-IT") : "");
const q = (n: number) => String(n).replace(".", ",");
const inp = "border border-neutral-300 rounded px-1.5 py-0.5 text-xs";

/** Spunta materiali della commessa: cosa è arrivato, cosa manca, prelievi dalle scorte e avvio commessa. */
export default async function MaterialeCommessa({ commessaId, puoGestire }: { commessaId: string; puoGestire: boolean }) {
  const [c, righe] = await Promise.all([
    prisma.commessa.findUnique({ where: { id: commessaId }, select: { materialeCompletoIl: true, saldoIncassato: true } }),
    prisma.rigaOrdine.findMany({ where: { commessaId }, include: { ordineFornitore: { select: { id: true, numero: true, anno: true, consegnaConfermata: true, consegnaRichiesta: true } }, righeBolla: { select: { bolla: { select: { id: true, numero: true, anno: true, stato: true } } } } }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!c || !righe.length) return null;
  const r = riepilogoMateriale(righe);
  const art = [...new Set(righe.map((x) => x.articoloId).filter(Boolean))] as string[];
  const [g, articoli, catalogo] = await Promise.all([
    giacenze(art),
    prisma.articolo.findMany({ where: { id: { in: art } }, select: { id: true, codice: true } }),
    puoGestire && righe.some((x) => !x.arrivato && !x.ordineFornitoreId && !x.daMagazzino) ? prisma.articolo.findMany({ where: { attivo: true }, select: { codice: true, descrizione: true }, orderBy: { codice: "asc" }, take: 5000 }) : Promise.resolve([]),
  ]);
  return (
    <div id="materiale" className={`border rounded-lg p-3 mb-4 ${r.completo ? "border-green-400 bg-green-50" : "border-neutral-200 bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-sm font-bold text-neutral-900">Materiale e avvio commessa</p>
        {c.materialeCompletoIl
          ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-600 text-white">✓ Materiale completo dal {dataIt(c.materialeCompletoIl)}{c.saldoIncassato ? " · saldo incassato" : " · task saldo e posa creati"}</span>
          : <span className="text-xs text-neutral-700">{r.arrivate}/{r.tot} righe disponibili{r.daOrdinare ? ` · ${r.daOrdinare} da ordinare` : ""}{r.inArrivo ? ` · ${r.inArrivo} in arrivo` : ""}{r.daPrelevare ? ` · ${r.daPrelevare} da prelevare dal magazzino` : ""}</span>}
      </div>
      <div className="h-2 bg-neutral-200 rounded mb-2"><div className={`h-2 rounded ${r.completo ? "bg-green-600" : "bg-amber-500"}`} style={{ width: `${r.percentuale}%` }} /></div>
      <table className="w-full text-xs">
        <tbody>
          {righe.map((x) => {
            const gi = x.articoloId ? g.get(x.articoloId) : undefined;
            const disp = gi ? gi.giacenza - gi.impegnato : 0;
            const bolle = [...new Map(x.righeBolla.map((rb) => [rb.bolla.id, rb.bolla])).values()].filter((b) => b.stato !== "ANNULLATA" && b.stato !== "APERTA");
            const prevista = x.ordineFornitore?.consegnaConfermata ?? x.ordineFornitore?.consegnaRichiesta;
            return (
              <tr key={x.id} className="border-b border-neutral-100 align-top">
                <td className="py-1 w-6">{x.arrivato ? "✅" : x.quantitaArrivata > 0 ? "🟡" : "⬜"}</td>
                <td className="py-1">{x.descrizione} <span className="text-neutral-500">× {q(x.quantita)} {x.um ?? ""}</span>
                  {x.quantitaArrivata > 0 && !x.arrivato && <span className="text-amber-800"> · arrivati {q(x.quantitaArrivata)}</span>}</td>
                <td className="py-1 text-neutral-700">
                  {x.prelevatoIl ? <>prelevato dal magazzino il {dataIt(x.prelevatoIl)}</>
                    : x.daMagazzino ? <>da magazzino ({articoli.find((a) => a.id === x.articoloId)?.codice}) · disponibili {q(disp + x.quantita)}</>
                    : x.ordineFornitore ? <Link href={`/ordini-fornitori/${x.ordineFornitore.id}`} className="underline">ord. {numeroOrdine(x.ordineFornitore)}</Link>
                    : x.ordinato ? "ordinato fuori CRM" : <span className="text-amber-800">da ordinare</span>}
                  {!x.arrivato && prevista ? <span className="text-neutral-500"> · prevista {dataIt(prevista)}</span> : null}
                  {bolle.map((b) => <Link key={b.id} href={`/magazzino/bolle/${b.id}`} className="block underline text-neutral-600">bolla {b.numero}/{b.anno}</Link>)}
                  {x.arrivato && !x.prelevatoIl && !bolle.length ? <span className="text-neutral-500"> · arrivato {dataIt(x.arrivatoIl)}</span> : null}
                </td>
                {puoGestire && (
                  <td className="py-1 text-right whitespace-nowrap">
                    {x.daMagazzino && !x.prelevatoIl && <span className="inline-flex gap-2">
                      <form action={prelevaDaMagazzino}><input type="hidden" name="rigaId" value={x.id} /><button className="btn-3d btn-3d-green text-[11px] px-2 py-0.5">Preleva</button></form>
                      <form action={togliImpegno}><input type="hidden" name="rigaId" value={x.id} /><button className="underline">non da magazzino</button></form></span>}
                    {x.prelevatoIl && <form action={annullaPrelievo}><input type="hidden" name="rigaId" value={x.id} /><button className="underline text-neutral-600">annulla prelievo</button></form>}
                    {!x.arrivato && !x.daMagazzino && !x.ordineFornitoreId && (
                      <form action={impegnaDaMagazzino} className="inline-flex gap-1">
                        <input type="hidden" name="rigaId" value={x.id} />
                        <input name="articolo" list={`mag-${commessaId}`} placeholder="articolo a scorta…" className={`${inp} w-40`} />
                        <button className="underline">prendi dal magazzino</button>
                      </form>
                    )}
                    {!x.arrivato && !x.daMagazzino && (x.ordineFornitoreId || x.ordinato) && (
                      <form action={segnaArrivatoInCantiere} className="inline-flex gap-1"><input type="hidden" name="rigaId" value={x.id} /><button className="underline text-neutral-600" title="Consegnato direttamente in cantiere, senza bolla in magazzino">arrivato in cantiere</button></form>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {catalogo.length > 0 && <datalist id={`mag-${commessaId}`}>{catalogo.map((a) => <option key={a.codice} value={`${a.codice} — ${a.descrizione}`} />)}</datalist>}
      {!r.completo && <p className="text-[11px] text-neutral-500 mt-1">Quando tutte le righe sono disponibili la commessa si avvia da sola: task alla fatturazione per il saldo e alla posa per la programmazione.</p>}
    </div>
  );
}
