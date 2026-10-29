export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { situazioneMagazzino } from "@/lib/magazzino/server";
import { salvaScorta, registraInventario, creaOrdiniRiordino, aggiungiArticoloAScorta } from "@/app/magazzino-actions";

type P = { vista?: string; q?: string };
const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });
const q = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";

export default async function GiacenzePage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const [tutte, catalogo] = await Promise.all([
    situazioneMagazzino(),
    prisma.articolo.findMany({ where: { attivo: true }, select: { codice: true, descrizione: true }, orderBy: { codice: "asc" }, take: 5000 }),
  ]);
  const cerca = p.q?.trim().toLowerCase();
  let righe = cerca ? tutte.filter((a) => `${a.codice} ${a.codiceFornitore ?? ""} ${a.descrizione} ${a.ubicazione ?? ""}`.toLowerCase().includes(cerca)) : tutte;
  if (p.vista === "sotto") righe = righe.filter((a) => a.sottoScorta);
  if (p.vista === "negativi") righe = righe.filter((a) => a.giacenza < 0);
  const valore = tutte.reduce((t, a) => t + (a.valore ?? 0), 0);
  const pill = (a: boolean) => `px-2.5 py-1 rounded-full text-xs border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`;
  const link = (vista?: string) => `?${new URLSearchParams(Object.entries({ q: p.q, vista }).filter(([, v]) => v) as [string, string][])}`;
  const inventario = p.vista === "inventario", riordino = p.vista === "sotto";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={link()} className={pill(!p.vista)}>Tutti ({tutte.length})</Link>
        <Link href={link("sotto")} className={pill(riordino)}>Sotto scorta / da riordinare ({tutte.filter((a) => a.sottoScorta).length})</Link>
        <Link href={link("negativi")} className={pill(p.vista === "negativi")}>Giacenza negativa ({tutte.filter((a) => a.giacenza < 0).length})</Link>
        <Link href={link("inventario")} className={pill(inventario)}>📋 Inventario</Link>
        <span className="ml-auto text-sm">Valore a costo medio: <b>{eur(valore)}</b></span>
      </div>
      <form className="flex gap-2"><input name="q" defaultValue={p.q ?? ""} placeholder="Codice, descrizione, ubicazione…" className={`${inp} w-72`} />{p.vista && <input type="hidden" name="vista" value={p.vista} />}<button className="btn-3d btn-3d-dark text-sm px-3 py-1">Cerca</button></form>

      {inventario || riordino ? (
        <form action={inventario ? registraInventario : creaOrdiniRiordino} className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50"><th className="p-2">Articolo</th><th>Ubicazione</th><th className="text-right">Giacenza</th><th className="text-right">Impegnato</th><th className="text-right">Disponibile</th><th className="text-right">Scorta min.</th><th>{inventario ? "Quantità contata" : "Da ordinare"}</th>{riordino && <th>Fornitore</th>}</tr></thead>
            <tbody>
              {righe.map((a) => (
                <tr key={a.id} className="border-b border-neutral-100">
                  <td className="p-2"><input type="hidden" name="articoloId" value={a.id} /><b className="text-xs">{a.codice}</b> {a.descrizione}</td>
                  <td className="text-xs">{a.ubicazione ?? ""}</td>
                  <td className="text-right">{q(a.giacenza)} {a.um}</td>
                  <td className="text-right">{q(a.impegnato)}</td>
                  <td className={`text-right ${a.disponibile < 0 ? "text-red-700 font-semibold" : ""}`}>{q(a.disponibile)}</td>
                  <td className="text-right">{q(a.scortaMinima)}</td>
                  <td>{inventario ? <input name={`contata_${a.id}`} placeholder={q(a.giacenza)} className={`${inp} w-24`} /> : <input name={`q_${a.id}`} defaultValue={q(a.daRiordinare)} className={`${inp} w-24`} />}</td>
                  {riordino && <td className={`text-xs ${a.fornitore ? "" : "text-amber-800"}`}>{a.fornitore?.ragioneSociale ?? "manca il fornitore in anagrafica"}</td>}
                </tr>
              ))}
              {righe.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-neutral-500">Nessun articolo.</td></tr>}
            </tbody>
          </table>
          {righe.length > 0 && (
            <div className="p-3 flex flex-wrap items-center gap-3 border-t border-neutral-200">
              <button className={`btn-3d ${inventario ? "btn-3d-blue" : "btn-3d-purple"} text-sm px-3 py-1.5`}>{inventario ? "Registra le quantità contate" : "Crea gli ordini di riordino (bozza, uno per fornitore)"}</button>
              <span className="text-xs text-neutral-500">{inventario ? "Compila solo le righe contate: il CRM registra la differenza come movimento d'inventario." : "Proposto: il doppio della scorta minima meno il disponibile. Gli ordini restano in bozza da controllare e inviare."}</span>
            </div>
          )}
        </form>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50"><th className="p-2">Articolo</th><th>Categoria</th><th className="text-right">Giacenza</th><th className="text-right">Impegnato</th><th className="text-right">Disponibile</th><th className="text-right">Costo medio</th><th className="text-right">Valore</th><th>Scorta min. · ubicazione</th></tr></thead>
            <tbody>
              {righe.map((a) => (
                <tr key={a.id} className={`border-b border-neutral-100 ${a.sottoScorta ? "bg-amber-50" : ""}`}>
                  <td className="p-2"><Link href={`/prodotti/articoli/${a.id}`} className="underline"><b className="text-xs">{a.codice}</b></Link> {a.descrizione}{a.fornitore ? <span className="block text-[11px] text-neutral-500">{a.fornitore.ragioneSociale}{a.codiceFornitore ? ` · ${a.codiceFornitore}` : ""}</span> : null}</td>
                  <td className="text-xs">{a.categoria?.nome ?? ""}</td>
                  <td className={`text-right ${a.giacenza < 0 ? "text-red-700 font-semibold" : ""}`}>{q(a.giacenza)} {a.um}</td>
                  <td className="text-right">{a.impegnato ? q(a.impegnato) : "—"}</td>
                  <td className={`text-right ${a.sottoScorta ? "text-amber-800 font-semibold" : ""}`}>{q(a.disponibile)}</td>
                  <td className="text-right">{a.costoMedio !== null ? eur(a.costoMedio) : "—"}</td>
                  <td className="text-right">{a.valore !== null ? eur(a.valore) : "—"}</td>
                  <td>
                    <form action={salvaScorta} className="flex gap-1 items-center">
                      <input type="hidden" name="articoloId" value={a.id} />
                      <input name="scortaMinima" defaultValue={q(a.scortaMinima)} placeholder="min" className={`${inp} w-16`} />
                      <input name="ubicazione" defaultValue={a.ubicazione ?? ""} placeholder="scaffale" className={`${inp} w-24`} />
                      <button className="text-xs underline">salva</button>
                    </form>
                  </td>
                </tr>
              ))}
              {righe.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-neutral-500">Nessun articolo a magazzino: entrano con le bolle a scorta, con un carico manuale o indicando una scorta minima qui sotto.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <form action={aggiungiArticoloAScorta} className="bg-white border border-dashed border-neutral-300 rounded-lg p-3 flex flex-wrap items-end gap-2">
        <span className="text-xs font-bold w-full">+ Gestisci a scorta un articolo dell&apos;anagrafica</span>
        <input name="articolo" list="cat-scorta" required placeholder="Codice o descrizione…" className={`${inp} flex-1 min-w-64`} />
        <datalist id="cat-scorta">{catalogo.map((a) => <option key={a.codice} value={`${a.codice} — ${a.descrizione}`} />)}</datalist>
        <input name="scortaMinima" placeholder="Scorta minima" className={`${inp} w-28`} />
        <input name="ubicazione" placeholder="Ubicazione" className={`${inp} w-32`} />
        <button className="btn-3d btn-3d-purple text-sm px-3 py-1.5">Aggiungi</button>
      </form>
    </div>
  );
}
