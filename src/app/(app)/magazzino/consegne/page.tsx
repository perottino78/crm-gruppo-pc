export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { giorniRitardo } from "@/lib/magazzino/calcoli";
import { numeroOrdine, statoOrdine } from "@/lib/ordini/calcoli";
import { numeroCommessa } from "@/lib/commesse";

type P = { fornitore?: string; vista?: string };
const dataIt = (d?: Date | null) => (d ? d.toLocaleDateString("it-IT") : "—");
const q = (n: number) => String(n).replace(".", ",");

/** Materiale ordinato e non ancora arrivato, con la data prevista e i ritardi (come «Consegne» di Bconsole). */
export default async function ConsegnePage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const righe = await prisma.rigaOrdine.findMany({
    where: { arrivato: false, ordineFornitore: { stato: { in: ["INVIATO", "CONFERMATO", "EVASO_PARZIALE", "BOZZA"] }, ...(p.fornitore ? { fornitoreId: p.fornitore } : {}) } },
    include: { ordineFornitore: { include: { fornitore: { select: { id: true, ragioneSociale: true } } } }, commessa: { select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } } } },
  });
  const voci = righe.map((r) => {
    const o = r.ordineFornitore!;
    const prevista = o.consegnaConfermata ?? o.consegnaRichiesta;
    return { r, o, prevista, confermata: !!o.consegnaConfermata, ritardo: giorniRitardo(prevista) };
  }).filter((v) => (p.vista === "ritardo" ? (v.ritardo ?? 0) > 0 && v.o.stato !== "BOZZA" : p.vista === "bozze" ? v.o.stato === "BOZZA" : v.o.stato !== "BOZZA"))
    .sort((a, b) => (a.prevista?.getTime() ?? 9e15) - (b.prevista?.getTime() ?? 9e15));
  const fornitori = [...new Map(righe.map((r) => [r.ordineFornitore!.fornitore.id, r.ordineFornitore!.fornitore.ragioneSociale])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const qs = (x: Partial<P>) => `?${new URLSearchParams(Object.entries({ ...p, ...x }).filter(([, v]) => v) as [string, string][])}`;
  const pill = (a: boolean) => `px-2.5 py-1 rounded-full text-xs border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 items-center">
        <Link href={qs({ vista: undefined })} className={pill(!p.vista)}>In arrivo</Link>
        <Link href={qs({ vista: "ritardo" })} className={pill(p.vista === "ritardo")}>In ritardo</Link>
        <Link href={qs({ vista: "bozze" })} className={pill(p.vista === "bozze")}>Ordini non ancora inviati</Link>
        <form className="ml-auto flex gap-2">{p.vista && <input type="hidden" name="vista" value={p.vista} />}
          <select name="fornitore" defaultValue={p.fornitore ?? ""} className="border border-neutral-300 rounded px-2 py-1 text-sm"><option value="">Tutti i fornitori</option>{fornitori.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <button className="btn-3d btn-3d-dark text-sm px-3 py-1">Filtra</button></form>
      </div>
      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50"><th className="p-2">Prevista</th><th>Ordine</th><th>Fornitore</th><th>Per</th><th>Articolo</th><th className="text-right">Da ricevere</th><th>Ritardo</th></tr></thead>
          <tbody>
            {voci.map(({ r, o, prevista, confermata, ritardo }) => (
              <tr key={r.id} className={`border-b border-neutral-100 ${ritardo !== null && ritardo > 0 ? "bg-red-50" : ""}`}>
                <td className="p-2 whitespace-nowrap">{dataIt(prevista)}<span className="block text-[11px] text-neutral-500">{prevista ? (confermata ? "confermata" : "richiesta") : "senza data"}</span></td>
                <td><Link href={`/ordini-fornitori/${o.id}`} className="underline" style={{ color: statoOrdine(o.stato).colore }}>{numeroOrdine(o)}</Link></td>
                <td>{o.fornitore.ragioneSociale}</td>
                <td className="text-xs">{r.commessa ? <Link href={`/commesse/${r.commessa.id}#materiale`} className="underline">{numeroCommessa(r.commessa)} {r.commessa.cliente.nome}</Link> : "scorta"}</td>
                <td>{r.codiceFornitore ? <b className="text-xs">{r.codiceFornitore} </b> : null}{r.descrizione}</td>
                <td className="text-right whitespace-nowrap">{q(Math.max(0, r.quantita - r.quantitaArrivata))} {r.um ?? "pz"}{r.quantitaArrivata > 0 ? <span className="block text-[11px] text-neutral-500">arrivati {q(r.quantitaArrivata)}</span> : null}</td>
                <td className="text-xs">{ritardo === null ? "—" : ritardo > 0 ? <b className="text-red-700">{ritardo} gg</b> : ritardo === 0 ? "oggi" : `fra ${-ritardo} gg`}</td>
              </tr>
            ))}
            {voci.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-neutral-500">Niente in attesa.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">Quando arriva la merce registra la bolla da «Bolle d&apos;entrata»: le righe si spuntano da lì.</p>
    </div>
  );
}
