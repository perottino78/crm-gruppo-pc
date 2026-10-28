export const dynamic = "force-dynamic";
// la conferma di listini lunghi scrive migliaia di righe: serve tempo
export const maxDuration = 300;

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoModificareArticoli, articoliPerConfronto, categorieRegola, nomeCategoria } from "@/lib/articoli/server";
import { alberoCategorie, euro, perc } from "@/lib/articoli/prezzi";
import { analizzaListino, contaAnteprima, DIVISIONI, type Opzioni, type RigaAnteprima } from "@/lib/articoli/importa";
import type { Tabella } from "@/lib/articoli/foglio";
import { aiDisponibile } from "@/lib/articoli/ai";
import { confermaImportazione, annullaImportazione, aggiornaOpzioniImportazione } from "@/app/articoli-actions";
import ControlloAI from "@/components/articoli/ControlloAI";

const inp = "border border-neutral-300 rounded px-2 py-1 text-sm w-full";
const MOSTRA = 300;

export default async function AnteprimaPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !puoModificareArticoli(u)) notFound();
  const { id } = await params;
  const imp = await prisma.importazioneArticoli.findUnique({ where: { id } });
  if (!imp) notFound();
  const opz = imp.opzioni as Opzioni & { troncato?: boolean };

  if (imp.stato !== "ANTEPRIMA") {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-4xl">
        <Link href="/prodotti/articoli/importa" className="text-sm text-blue-800 underline">← Importazioni</Link>
        <h1 className="text-2xl font-bold">{imp.nomeFile}</h1>
        {imp.stato === "ESEGUITA" ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-1">
            <p className="font-bold text-green-900">✅ Importazione eseguita il {imp.eseguitaIl?.toLocaleString("it-IT")}</p>
            <p>{imp.creati} articoli nuovi · {imp.aggiornati} aggiornati · {imp.invariati} già uguali · {imp.scartati} righe non importate (errori o saltate).</p>
            <p><Link href="/prodotti/articoli" className="underline">Vai all&apos;anagrafica articoli</Link> · <Link href="/prodotti/articoli/categorie" className="underline">controlla le regole delle categorie</Link></p>
          </div>
        ) : <p className="text-sm text-neutral-600">Importazione annullata: nessun articolo è stato modificato.</p>}
      </div>
    );
  }

  const [esistenti, fornitori, categorie, cat] = await Promise.all([
    articoliPerConfronto(),
    prisma.soggetto.findMany({ where: { ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" }, select: { id: true, ragioneSociale: true, scontoFornitore: true } }),
    categorieRegola(),
    prisma.categoriaArticolo.findMany({ select: { id: true, nome: true, padreId: true, ordine: true } }),
  ]);
  const an = analizzaListino(imp.righe as Tabella, opz, esistenti, fornitori, categorie);
  const n = contaAnteprima(an.righe);
  const daScrivere = n.nuovi + n.modificati;
  const gruppo = (a: RigaAnteprima["azione"]) => an.righe.filter((r) => r.azione === a);
  const conAvvisi = an.righe.filter((r) => (r.azione === "NUOVO" || r.azione === "MODIFICA") && r.avvisi.length);
  const albero = alberoCategorie(cat);
  const catDi = (r: RigaAnteprima) => r.dati.categoriaNome ? `${r.dati.categoriaNome}${r.dati.sottocategoriaNome ? ` › ${r.dati.sottocategoriaNome}` : ""} (nuova)` : nomeCategoria(r.dati.categoriaId ?? esistenti.find((e) => e.id === r.articoloId)?.categoriaId, cat);
  const fornDi = (r: RigaAnteprima) => fornitori.find((f) => f.id === (r.dati.fornitoreId ?? esistenti.find((e) => e.id === r.articoloId)?.fornitoreId))?.ragioneSociale ?? "—";

  const elenco = (righe: RigaAnteprima[], modifiche?: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-neutral-500 text-left"><tr><th className="py-1 pr-2">Riga</th><th className="pr-2">Codice</th><th className="pr-2">Descrizione</th>{modifiche ? <th className="pr-2">Cosa cambia</th> : <><th className="pr-2">Categoria</th><th className="pr-2">Fornitore</th></>}<th className="text-right pr-2">Costo</th><th className="text-right pr-2">Vendita</th><th className="text-right pr-2">Margine</th><th>Avvisi</th></tr></thead>
        <tbody className="divide-y divide-neutral-100">
          {righe.slice(0, MOSTRA).map((r) => (
            <tr key={r.riga} className="align-top">
              <td className="py-1 pr-2 text-neutral-500">{r.riga}</td>
              <td className="pr-2 font-mono whitespace-nowrap">{r.codice ?? r.dati.codiceFornitore ?? "auto"}</td>
              <td className="pr-2">{r.articoloId ? <Link href={`/prodotti/articoli/${r.articoloId}`} className="hover:underline" target="_blank">{r.descrizione}</Link> : r.descrizione}</td>
              {modifiche ? <td className="pr-2">{r.modifiche.map((m) => <div key={m.campo}><span className="text-neutral-500">{m.campo}:</span> <s className="text-neutral-400">{m.prima}</s> → <b>{m.dopo}</b></div>)}</td> : <><td className="pr-2">{catDi(r) || "—"}</td><td className="pr-2">{fornDi(r)}</td></>}
              <td className="text-right pr-2 whitespace-nowrap">{euro(r.costo)}</td>
              <td className="text-right pr-2 whitespace-nowrap font-medium">{euro(r.vendita)}</td>
              <td className={`text-right pr-2 whitespace-nowrap ${r.margine !== null && r.margine < 0 ? "text-red-700 font-bold" : ""}`}>{perc(r.margine)}</td>
              <td className="text-amber-800">{[...r.errori.map((e) => `❌ ${e}`), ...r.avvisi].join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {righe.length > MOSTRA && <p className="text-xs text-neutral-500 mt-1">… e altre {righe.length - MOSTRA} righe (verranno importate anche se non mostrate).</p>}
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      <div>
        <Link href="/prodotti/articoli/importa" className="text-sm text-blue-800 underline">← Importazioni</Link>
        <h1 className="text-2xl font-bold text-neutral-900">Anteprima: {imp.nomeFile}</h1>
        <p className="text-sm text-neutral-600">Caricato da {imp.creataDaNome} il {imp.createdAt.toLocaleString("it-IT")}. Niente è ancora stato salvato.</p>
      </div>
      {an.errore && <p className="text-sm bg-red-50 border border-red-200 text-red-900 rounded px-3 py-2">⚠️ {an.errore}</p>}
      {opz.troncato && <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded px-3 py-2">⚠️ Il listino era troppo lungo per una sola lettura: l&apos;AI ha letto solo la prima parte. Conferma questa e poi carica le pagine restanti.</p>}

      {!an.errore && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
            {[["Nuovi", n.nuovi, "text-green-800"], ["Modificati", n.modificati, "text-blue-800"], ["Già uguali", n.invariati, "text-neutral-600"], ["Con errori", n.errori, "text-red-700"], ["Con avvisi", n.avvisi, "text-amber-700"]].map(([t, v, c]) => (
              <div key={t as string} className="bg-white border border-neutral-200 rounded-lg p-2"><div className={`text-2xl font-bold ${c}`}>{v as number}</div><div className="text-xs text-neutral-600">{t as string}</div></div>
            ))}
          </div>

          <details className="bg-white border border-neutral-200 rounded-lg p-3 text-sm">
            <summary className="cursor-pointer font-medium">Colonne riconosciute ({an.colonne.length}){an.ignorate.length ? ` · ${an.ignorate.length} ignorate` : ""}{an.categorieNuove.length ? ` · ${an.categorieNuove.length} categorie nuove` : ""}</summary>
            <ul className="mt-2 text-xs text-neutral-700 columns-1 md:columns-2">{an.colonne.map((c) => <li key={c}>✓ {c}</li>)}</ul>
            {an.ignorate.length > 0 && <p className="mt-2 text-xs text-neutral-500">Ignorate: {an.ignorate.join(", ")}</p>}
            {an.categorieNuove.length > 0 && <p className="mt-2 text-xs">Verranno create: <b>{an.categorieNuove.join(", ")}</b>. Dopo l&apos;importazione dai loro la regola di prezzo in <Link href="/prodotti/articoli/categorie" className="underline">Categorie e ricarichi</Link>.</p>}
          </details>

          <form action={aggiornaOpzioniImportazione} className="bg-white border border-neutral-200 rounded-lg p-3 grid md:grid-cols-7 gap-2 items-end text-sm">
            <input type="hidden" name="id" value={imp.id} />
            <label className="md:col-span-2">Fornitore del listino<select name="fornitoreId" defaultValue={opz.fornitoreId ?? ""} className={inp}><option value="">— dal file —</option>{fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}</select></label>
            <label>Divisione<select name="divisione" defaultValue={opz.divisione ?? ""} className={inp}><option value="">—</option>{DIVISIONI.map((d) => <option key={d}>{d}</option>)}</select></label>
            <label className="md:col-span-2">Categoria per i nuovi senza categoria<select name="categoriaId" defaultValue={opz.categoriaId ?? ""} className={inp}><option value="">—</option>{albero.map((c) => <option key={c.id} value={c.id}>{c.etichetta}</option>)}</select></label>
            <label className="flex items-center gap-1"><input type="checkbox" name="soloAggiornamento" value="1" defaultChecked={!!opz.soloAggiornamento} /> solo aggiorna</label>
            <button className="btn-3d btn-3d-outline text-sm px-3 py-1.5">Ricalcola anteprima</button>
          </form>

          {aiDisponibile() && <ControlloAI id={imp.id} testo={imp.controlloAi} />}

          {n.errori > 0 && <details open className="bg-white border border-red-200 rounded-lg p-3"><summary className="cursor-pointer font-bold text-red-800">❌ Righe con errori ({n.errori}) — non verranno importate</summary>{elenco(gruppo("ERRORE"))}</details>}
          {conAvvisi.length > 0 && <details open className="bg-white border border-amber-200 rounded-lg p-3"><summary className="cursor-pointer font-bold text-amber-800">⚠️ Da controllare ({conAvvisi.length}) — verranno importate</summary>{elenco(conAvvisi)}</details>}
          {n.nuovi > 0 && <details open={n.nuovi <= 50} className="bg-white border border-neutral-200 rounded-lg p-3"><summary className="cursor-pointer font-bold text-green-800">🆕 Articoli nuovi ({n.nuovi})</summary>{elenco(gruppo("NUOVO"))}</details>}
          {n.modificati > 0 && <details open={n.modificati <= 50} className="bg-white border border-neutral-200 rounded-lg p-3"><summary className="cursor-pointer font-bold text-blue-800">✏️ Modificati ({n.modificati})</summary>{elenco(gruppo("MODIFICA"), true)}</details>}
          {n.invariati > 0 && <details className="bg-white border border-neutral-200 rounded-lg p-3"><summary className="cursor-pointer font-medium text-neutral-600">= Già uguali ({n.invariati})</summary>{elenco(gruppo("INVARIATO"))}</details>}
          {n.saltate > 0 && <details className="bg-white border border-neutral-200 rounded-lg p-3"><summary className="cursor-pointer font-medium text-neutral-600">Saltate ({n.saltate}) — non in anagrafica</summary>{elenco(gruppo("SALTATA"))}</details>}
        </>
      )}

      <div className="flex flex-wrap gap-3 items-center sticky bottom-0 bg-neutral-100/95 py-3">
        {!an.errore && (
          <form action={confermaImportazione}>
            <input type="hidden" name="id" value={imp.id} />
            <button disabled={daScrivere === 0} className="btn-3d btn-3d-green text-sm px-4 py-2">✔ Conferma: crea {n.nuovi} e aggiorna {n.modificati}</button>
          </form>
        )}
        <form action={annullaImportazione}><input type="hidden" name="id" value={imp.id} /><button className="btn-3d btn-3d-outline text-sm px-3 py-2">Annulla</button></form>
        {daScrivere === 0 && !an.errore && <span className="text-sm text-neutral-600">Non c&apos;è niente da importare.</span>}
      </div>
    </div>
  );
}
