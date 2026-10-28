export const dynamic = "force-dynamic";
export const maxDuration = 120;

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoVedereArticoli, puoModificareArticoli } from "@/lib/articoli/server";
import { alberoCategorie, testoRegola } from "@/lib/articoli/prezzi";
import { DIVISIONI } from "@/lib/articoli/importa";
import { salvaCategoria, eliminaCategoria, ricalcolaTutto } from "@/app/articoli-actions";

const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";
const n = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

export default async function CategoriePage({ searchParams }: { searchParams: Promise<{ ok?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u || !puoVedereArticoli(u)) notFound();
  const admin = puoModificareArticoli(u);
  const p = await searchParams;
  const [cat, conteggi] = await Promise.all([
    prisma.categoriaArticolo.findMany(),
    prisma.articolo.groupBy({ by: ["categoriaId"], _count: { _all: true } }),
  ]);
  const quanti = (id: string) => conteggi.find((c) => c.categoriaId === id)?._count._all ?? 0;
  const albero = alberoCategorie(cat);
  const madri = albero.filter((c) => c.livello === 0);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div>
        <Link href="/prodotti/articoli" className="text-sm text-blue-800 underline">← Anagrafica articoli</Link>
        <h1 className="text-2xl font-bold text-neutral-900">🗂 Categorie e regole di prezzo</h1>
        <p className="text-sm text-neutral-600">Ogni categoria ha la sua regola. <b>Ricarico</b>: prezzo = costo × coefficiente (es. ×3,3: costo 100 € → vendita 330 €). <b>Margine</b>: prezzo = costo ÷ (1 − margine) (es. 40%: costo 60 € → vendita 100 €, e su 100 € ne guadagni 40). Le sottocategorie senza regola usano quella della categoria madre. L&apos;arrotondamento è sempre per eccesso.</p>
      </div>
      {p.ok && <p className="text-sm bg-green-50 border border-green-200 text-green-900 rounded px-3 py-2">✅ {p.ok}</p>}
      {p.errore && <p className="text-sm bg-red-50 border border-red-200 text-red-900 rounded px-3 py-2">⚠️ {p.errore}</p>}

      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-600 text-left">
            <tr><th className="px-2 py-2">Nome</th><th className="px-2 py-2">Divisione</th><th className="px-2 py-2">Regola</th><th className="px-2 py-2">Valore</th><th className="px-2 py-2">Arrotonda a €</th><th className="px-2 py-2">Margine min. %</th><th className="px-2 py-2 text-right">Articoli</th><th className="px-2 py-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {albero.map((c) => (
              <tr key={c.id} className={c.livello ? "bg-neutral-50/50" : ""}>
                <td colSpan={8} className="p-0">
                  {admin ? (
                    <form action={salvaCategoria} className="grid grid-cols-[minmax(160px,2fr)_1fr_1.3fr_0.7fr_0.8fr_0.8fr_0.5fr_auto] gap-1.5 items-center px-2 py-1.5">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="padreId" value={c.padreId ?? ""} />
                      <input name="nome" defaultValue={c.nome} className={`${inp} ${c.livello ? "ml-5" : "font-bold"}`} />
                      <select name="divisione" defaultValue={c.divisione ?? ""} className={inp}><option value="">—</option>{DIVISIONI.map((d) => <option key={d}>{d}</option>)}</select>
                      <select name="metodoPrezzo" defaultValue={c.metodoPrezzo ?? ""} className={inp}><option value="">{c.livello ? "come la madre" : "nessuna"}</option><option value="RICARICO">Ricarico ×</option><option value="MARGINE">Margine %</option></select>
                      <input name="valore" defaultValue={n(c.valore)} placeholder={c.metodoPrezzo === "MARGINE" ? "40" : "3,3"} className={inp} />
                      <input name="arrotondamento" defaultValue={n(c.arrotondamento)} placeholder="0,01" className={inp} />
                      <input name="margineMinimo" defaultValue={n(c.margineMinimo)} placeholder="—" className={inp} />
                      <span className="text-right text-neutral-600">{quanti(c.id)}</span>
                      <span className="flex gap-1 items-center whitespace-nowrap">
                        <label className="text-[11px] flex items-center gap-0.5" title="Ricalcola subito i prezzi degli articoli di questa categoria"><input type="checkbox" name="ricalcola" value="1" defaultChecked /> ricalcola</label>
                        <button className="btn-3d btn-3d-purple text-[11px] px-2 py-1">Salva</button>
                        <button formAction={eliminaCategoria} className="text-[11px] text-red-700 underline px-1" title="Elimina (solo se vuota)">✕</button>
                      </span>
                    </form>
                  ) : (
                    <div className="grid grid-cols-[2fr_1fr_1.3fr_0.7fr_0.8fr_0.8fr_0.5fr] gap-1.5 px-2 py-1.5">
                      <span className={c.livello ? "ml-5" : "font-bold"}>{c.nome}</span><span>{c.divisione ?? "—"}</span>
                      <span>{c.metodoPrezzo ? testoRegola({ metodo: c.metodoPrezzo, valore: c.valore }) : c.livello ? "come la madre" : "nessuna"}</span><span /><span>{n(c.arrotondamento) || "—"}</span><span>{n(c.margineMinimo) || "—"}</span><span className="text-right">{quanti(c.id)}</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {albero.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-neutral-500">Nessuna categoria: creane una qui sotto (oppure verranno create dall&apos;importazione di un listino).</td></tr>}
          </tbody>
        </table>
      </div>

      {admin && (
        <section className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="font-bold mb-2">+ Nuova categoria o sottocategoria</h2>
          <form action={salvaCategoria} className="grid md:grid-cols-7 gap-2 items-end text-sm">
            <label className="md:col-span-2">Nome<input name="nome" required className={`${inp} w-full`} placeholder="es. Pergole, Motori, Filtri" /></label>
            <label className="md:col-span-2">Dentro la categoria<select name="padreId" defaultValue="" className={`${inp} w-full`}><option value="">— nessuna (categoria principale) —</option>{madri.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
            <label>Regola<select name="metodoPrezzo" defaultValue="" className={`${inp} w-full`}><option value="">nessuna / come la madre</option><option value="RICARICO">Ricarico ×</option><option value="MARGINE">Margine %</option></select></label>
            <label>Valore<input name="valore" className={`${inp} w-full`} placeholder="3,3 o 40" /></label>
            <label>Divisione<select name="divisione" defaultValue="" className={`${inp} w-full`}><option value="">—</option>{DIVISIONI.map((d) => <option key={d}>{d}</option>)}</select></label>
            <label>Arrotonda a €<input name="arrotondamento" className={`${inp} w-full`} placeholder="es. 1 o 5" /></label>
            <label>Margine minimo %<input name="margineMinimo" className={`${inp} w-full`} placeholder="es. 25" /></label>
            <button className="btn-3d btn-3d-purple text-sm px-3 py-1.5">Crea</button>
          </form>
        </section>
      )}
      {admin && albero.length > 0 && (
        <form action={ricalcolaTutto} className="flex items-center gap-3 text-sm">
          <button className="btn-3d btn-3d-orange text-sm px-3 py-1.5">Ricalcola i prezzi di tutto il catalogo</button>
          <span className="text-neutral-500">Applica le regole attuali a tutti gli articoli (quelli con prezzo a mano non cambiano). Ogni variazione resta nello storico.</span>
        </form>
      )}
    </div>
  );
}
