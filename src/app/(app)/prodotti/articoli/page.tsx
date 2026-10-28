export const dynamic = "force-dynamic";
export const maxDuration = 120;

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoVedereArticoli, puoModificareArticoli, filtroArticoli, categorieRegola, nomeCategoria, type FiltriArticoli } from "@/lib/articoli/server";
import { calcolaArticolo, testoRegola, euro, perc, alberoCategorie } from "@/lib/articoli/prezzi";
import { DIVISIONI } from "@/lib/articoli/importa";
import { aggiornamentoInBlocco } from "@/app/articoli-actions";

type P = FiltriArticoli & { pagina?: string; ok?: string; errore?: string; eliminato?: string; disattivato?: string };
const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";
const PER_PAGINA = 100;

export default async function ArticoliPage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u || !puoVedereArticoli(u)) notFound();
  const admin = puoModificareArticoli(u);
  const p = await searchParams;
  const pagina = Math.max(1, Number(p.pagina) || 1);
  const [cat, regole, fornitori] = await Promise.all([
    prisma.categoriaArticolo.findMany({ select: { id: true, nome: true, padreId: true, ordine: true } }),
    categorieRegola(),
    prisma.soggetto.findMany({ where: { ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" }, select: { id: true, ragioneSociale: true } }),
  ]);
  const where = filtroArticoli(p, cat);
  const [totale, totaleTutti, lista] = await Promise.all([
    prisma.articolo.count({ where }),
    prisma.articolo.count(),
    prisma.articolo.findMany({ where, include: { fornitore: { select: { ragioneSociale: true } } }, orderBy: [{ codice: "asc" }], skip: (pagina - 1) * PER_PAGINA, take: PER_PAGINA }),
  ]);
  const albero = alberoCategorie(cat);
  const filtri = Object.fromEntries(Object.entries({ q: p.q, categoria: p.categoria, fornitore: p.fornitore, divisione: p.divisione, stato: p.stato, senzaPrezzo: p.senzaPrezzo }).filter(([, v]) => v)) as Record<string, string>;
  const qs = (x: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ ...filtri, ...x }).filter(([, v]) => v) as [string, string][])}`;
  const pagine = Math.ceil(totale / PER_PAGINA);
  const righe = lista.map((a) => ({ a, c: calcolaArticolo(a, regole) }));
  const sottoMin = righe.filter((r) => r.c.sottoMinimo || (r.c.margine !== null && r.c.margine < 0)).length;
  const exp = (formato: string) => `/api/articoli/esporta?${new URLSearchParams({ ...filtri, formato })}`;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/prodotti" className="text-sm text-blue-800 underline">← Prodotti & listini</Link>
          <h1 className="text-2xl font-bold text-neutral-900">📦 Anagrafica articoli</h1>
          <p className="text-sm text-neutral-600">Catalogo a pezzo con fornitore, costo d&apos;acquisto, regola di ricarico o margine e prezzo di vendita. {totaleTutti} articoli in anagrafica.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {admin && <Link href="/prodotti/articoli/nuovo" className="btn-3d btn-3d-purple text-sm px-3 py-1.5">+ Nuovo articolo</Link>}
          {admin && <Link href="/prodotti/articoli/importa" className="btn-3d btn-3d-blue text-sm px-3 py-1.5">⬆ Importa Excel / CSV</Link>}
          {admin && <Link href="/prodotti/articoli/importa#ai" className="btn-3d btn-3d-teal text-sm px-3 py-1.5">✨ Leggi listino con AI</Link>}
          <Link href="/prodotti/articoli/categorie" className="btn-3d btn-3d-outline text-sm px-3 py-1.5">🗂 Categorie e ricarichi</Link>
        </div>
      </div>

      {p.ok && <p className="text-sm bg-green-50 border border-green-200 text-green-900 rounded px-3 py-2">✅ {p.ok}</p>}
      {p.errore && <p className="text-sm bg-red-50 border border-red-200 text-red-900 rounded px-3 py-2">⚠️ {p.errore}</p>}
      {p.eliminato && <p className="text-sm bg-green-50 border border-green-200 text-green-900 rounded px-3 py-2">Articolo eliminato.</p>}
      {p.disattivato && <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded px-3 py-2">L&apos;articolo era già stato usato negli ordini: è stato disattivato invece che eliminato.</p>}

      {totaleTutti === 0 && (
        <section className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm space-y-1">
          <p className="font-bold">Come si parte</p>
          <p>1. In <Link href="/prodotti/articoli/categorie" className="underline">Categorie e ricarichi</Link> crea le categorie e dai a ognuna la regola di prezzo (es. Pergole ×3,3, Depurazione margine 40%).</p>
          <p>2. Scarica il <a href="/api/articoli/modello" className="underline">modello Excel</a>, compilalo oppure carica direttamente il listino del fornitore da <Link href="/prodotti/articoli/importa" className="underline">Importa</Link>. Per i listini in PDF o fotografati usa «Leggi listino con AI».</p>
          <p>3. Controlla l&apos;anteprima e conferma: i prezzi di vendita si calcolano da soli.</p>
        </section>
      )}

      <form className="flex flex-wrap gap-2 items-center bg-white border border-neutral-200 rounded-lg p-3">
        <input name="q" defaultValue={p.q} placeholder="Cerca codice, descrizione, marca, EAN…" className={`${inp} w-64`} />
        <select name="categoria" defaultValue={p.categoria ?? ""} className={inp}>
          <option value="">Tutte le categorie</option>
          <option value="nessuna">— senza categoria —</option>
          {albero.map((c) => <option key={c.id} value={c.id}>{c.livello ? `   › ${c.nome}` : c.nome}</option>)}
        </select>
        <select name="fornitore" defaultValue={p.fornitore ?? ""} className={inp}>
          <option value="">Tutti i fornitori</option>
          <option value="nessuno">— senza fornitore —</option>
          {fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
        </select>
        <select name="divisione" defaultValue={p.divisione ?? ""} className={inp}>
          <option value="">Tutte le divisioni</option>
          {DIVISIONI.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select name="stato" defaultValue={p.stato ?? ""} className={inp}>
          <option value="">Attivi</option><option value="disattivi">Disattivati</option><option value="tutti">Tutti</option>
        </select>
        <label className="text-sm flex items-center gap-1"><input type="checkbox" name="senzaPrezzo" value="1" defaultChecked={!!p.senzaPrezzo} /> senza prezzo</label>
        <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5">Filtra</button>
        {Object.keys(filtri).length > 0 && <Link href="/prodotti/articoli" className="text-sm underline">azzera</Link>}
        <span className="ml-auto flex flex-wrap gap-2 text-sm">
          <a href={exp("xlsx")} className="text-blue-800 underline">⬇ Esporta Excel</a>
          <a href={exp("csv")} className="text-blue-800 underline">⬇ CSV</a>
          <a href="/api/articoli/modello" className="text-blue-800 underline">📄 Modello vuoto</a>
        </span>
      </form>

      <div className="text-sm text-neutral-600">
        {totale} articoli{totale !== totaleTutti ? " con questi filtri" : ""}{sottoMin > 0 && <span className="text-red-700"> · {sottoMin} in questa pagina con margine sotto il minimo</span>}
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-600 text-left">
            <tr>
              <th className="px-2 py-2"></th><th className="px-2 py-2">Codice</th><th className="px-2 py-2">Descrizione</th><th className="px-2 py-2">Categoria</th>
              <th className="px-2 py-2">Fornitore</th><th className="px-2 py-2 text-right">Costo</th><th className="px-2 py-2">Regola</th>
              <th className="px-2 py-2 text-right">Vendita</th><th className="px-2 py-2 text-right">Margine</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {righe.map(({ a, c }) => (
              <tr key={a.id} className={`hover:bg-neutral-50 ${a.attivo ? "" : "opacity-50"}`}>
                <td className="px-2 py-1.5 w-10">{a.immagineUrl ? <img src={a.immagineUrl} alt="" className="w-9 h-9 object-cover rounded border border-neutral-200" loading="lazy" /> : <span className="inline-block w-9 h-9 rounded bg-neutral-100" />}</td>
                <td className="px-2 py-1.5 whitespace-nowrap"><Link href={`/prodotti/articoli/${a.id}`} className="text-blue-800 underline font-mono text-xs">{a.codice}</Link>{a.codiceFornitore && <div className="text-[11px] text-neutral-500 font-mono">{a.codiceFornitore}</div>}</td>
                <td className="px-2 py-1.5"><Link href={`/prodotti/articoli/${a.id}`} className="hover:underline">{a.descrizione}</Link>{(a.marca || a.um !== "pz") && <div className="text-[11px] text-neutral-500">{[a.marca, a.um !== "pz" ? `al ${a.um}` : ""].filter(Boolean).join(" · ")}</div>}</td>
                <td className="px-2 py-1.5 text-xs">{nomeCategoria(a.categoriaId, cat) || <span className="text-neutral-400">—</span>}</td>
                <td className="px-2 py-1.5 text-xs">{a.fornitore?.ragioneSociale ?? <span className="text-neutral-400">—</span>}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">{euro(c.costo)}{a.prezzoListino !== null && a.sconti && <div className="text-[11px] text-neutral-500">{euro(a.prezzoListino)} −{a.sconti}</div>}</td>
                <td className="px-2 py-1.5 text-xs whitespace-nowrap">{c.regola ? testoRegola(c.regola) : <span className="text-amber-700">nessuna</span>}{c.regola && c.regola.da !== "articolo" && <div className="text-[11px] text-neutral-400">da {c.regola.da}</div>}</td>
                <td className="px-2 py-1.5 text-right font-medium whitespace-nowrap">{euro(c.vendita)}</td>
                <td className={`px-2 py-1.5 text-right whitespace-nowrap ${c.margine !== null && (c.margine < 0 || c.sottoMinimo) ? "text-red-700 font-bold" : ""}`}>{perc(c.margine)}</td>
              </tr>
            ))}
            {righe.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-neutral-500">Nessun articolo{totaleTutti ? " con questi filtri" : ""}.</td></tr>}
          </tbody>
        </table>
      </div>
      {pagine > 1 && (
        <div className="flex gap-2 items-center text-sm">
          {pagina > 1 && <Link href={qs({ pagina: String(pagina - 1) })} className="underline">← precedenti</Link>}
          <span>pagina {pagina} di {pagine}</span>
          {pagina < pagine && <Link href={qs({ pagina: String(pagina + 1) })} className="underline">successivi →</Link>}
        </div>
      )}

      {admin && totaleTutti > 0 && (
        <details className="bg-white border border-neutral-200 rounded-lg p-3" open={!!p.fornitore || undefined}>
          <summary className="cursor-pointer font-bold">🔁 Aggiornamento prezzi in blocco (es. aumento listino di un fornitore)</summary>
          <form action={aggiornamentoInBlocco} className="mt-3 grid md:grid-cols-6 gap-2 items-end text-sm">
            <label className="md:col-span-2">Fornitore<select name="fornitoreId" defaultValue={p.fornitore && p.fornitore !== "nessuno" ? p.fornitore : ""} className={`${inp} w-full`}><option value="">— tutti —</option>{fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}</select></label>
            <label className="md:col-span-2">Categoria<select name="categoriaId" defaultValue={p.categoria && p.categoria !== "nessuna" ? p.categoria : ""} className={`${inp} w-full`}><option value="">— tutte —</option>{albero.map((c) => <option key={c.id} value={c.id}>{c.etichetta}</option>)}</select></label>
            <label>Variazione listino/costo %<input name="variazione" placeholder="es. 4,5 o -3" className={`${inp} w-full`} /></label>
            <label>Nuovi sconti<input name="sconti" placeholder="es. 50+10" className={`${inp} w-full`} /></label>
            <label className="md:col-span-3">Sposta nella categoria<select name="nuovaCategoriaId" defaultValue="" className={`${inp} w-full`}><option value="">— non spostare —</option>{albero.map((c) => <option key={c.id} value={c.id}>{c.etichetta}</option>)}</select></label>
            <p className="md:col-span-2 text-xs text-neutral-500">Vale per tutti gli articoli del fornitore e/o della categoria (sottocategorie comprese). Dopo l&apos;aggiornamento i prezzi di vendita si ricalcolano con le regole; quelli scritti a mano restano.</p>
            <button className="btn-3d btn-3d-orange text-sm px-3 py-1.5">Applica</button>
          </form>
        </details>
      )}
    </div>
  );
}
