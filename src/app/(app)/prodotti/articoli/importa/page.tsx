export const dynamic = "force-dynamic";
export const maxDuration = 120;

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoModificareArticoli } from "@/lib/articoli/server";
import { alberoCategorie } from "@/lib/articoli/prezzi";
import { DIVISIONI } from "@/lib/articoli/importa";
import { aiDisponibile } from "@/lib/articoli/ai";
import { caricaListino } from "@/app/articoli-actions";
import LeggiListinoAI from "@/components/articoli/LeggiListinoAI";

const inp = "border border-neutral-300 rounded px-2 py-1 text-sm w-full";
const STATI: Record<string, string> = { ANTEPRIMA: "da confermare", ESEGUITA: "importata", ANNULLATA: "annullata" };

export default async function ImportaPage({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u || !puoModificareArticoli(u)) notFound();
  const p = await searchParams;
  const [fornitori, cat, storico] = await Promise.all([
    prisma.soggetto.findMany({ where: { attivo: true, ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" }, select: { id: true, ragioneSociale: true } }),
    prisma.categoriaArticolo.findMany({ select: { id: true, nome: true, padreId: true, ordine: true } }),
    prisma.importazioneArticoli.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, nomeFile: true, origine: true, stato: true, creati: true, aggiornati: true, scartati: true, creataDaNome: true, createdAt: true } }),
  ]);
  const albero = alberoCategorie(cat).map((c) => ({ id: c.id, etichetta: c.etichetta }));
  const opzioni = (
    <>
      <label className="md:col-span-2">Fornitore del listino<select name="fornitoreId" defaultValue="" className={inp}><option value="">— dal file (colonna FORNITORE) —</option>{fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}</select></label>
      <label className="md:col-span-2">Divisione per i nuovi<select name="divisione" defaultValue="" className={inp}><option value="">—</option>{DIVISIONI.map((d) => <option key={d}>{d}</option>)}</select></label>
      <label className="md:col-span-2">Categoria per i nuovi senza categoria<select name="categoriaId" defaultValue="" className={inp}><option value="">—</option>{albero.map((c) => <option key={c.id} value={c.id}>{c.etichetta}</option>)}</select></label>
    </>
  );
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div>
        <Link href="/prodotti/articoli" className="text-sm text-blue-800 underline">← Anagrafica articoli</Link>
        <h1 className="text-2xl font-bold text-neutral-900">⬆ Importa articoli e listini</h1>
        <p className="text-sm text-neutral-600">Prima vedi l&apos;anteprima con nuovi, modifiche (prezzo vecchio → nuovo) ed errori; niente cambia finché non confermi.</p>
      </div>
      {p.errore && <p className="text-sm bg-red-50 border border-red-200 text-red-900 rounded px-3 py-2">⚠️ {p.errore}</p>}

      <section className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">1. Da file Excel o CSV</h2>
          <span className="text-sm flex gap-3"><a href="/api/articoli/modello" className="text-blue-800 underline">📄 Modello Excel</a><a href="/api/articoli/modello?formato=csv" className="text-blue-800 underline">Modello CSV</a><a href="/api/articoli/esporta" className="text-blue-800 underline">⬇ Esporta il catalogo attuale</a></span>
        </div>
        <p className="text-xs text-neutral-600">Va bene il modello compilato, l&apos;esportazione del catalogo modificata (per aggiornare i prezzi) o il listino del fornitore così com&apos;è: le colonne si riconoscono dal titolo (Codice, Descrizione, Prezzo listino, Sconti, Categoria…). File .xlsx o .csv fino a 5 MB.</p>
        <form action={caricaListino} className="grid md:grid-cols-6 gap-2 items-end text-sm">
          <label className="md:col-span-6">File<input type="file" name="file" required accept=".xlsx,.csv,.txt,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="block mt-1" /></label>
          {opzioni}
          <label className="md:col-span-4 flex items-center gap-1"><input type="checkbox" name="soloAggiornamento" value="1" /> Solo aggiornamento prezzi: non creare articoli nuovi</label>
          <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5 md:col-span-2">Carica e mostra anteprima</button>
        </form>
      </section>

      <section id="ai" className="bg-white border border-teal-200 rounded-lg p-4 space-y-3">
        <h2 className="font-bold">2. ✨ Listino in PDF o fotografato: lo legge l&apos;AI</h2>
        <p className="text-xs text-neutral-600">L&apos;AI trasforma il documento nella tabella del modello e apre la stessa anteprima: controlli, correggi le opzioni e confermi. Fino a 4 MB per volta: i listini lunghi caricali a pezzi (es. per sezione).</p>
        <LeggiListinoAI fornitori={fornitori} categorie={albero} divisioni={DIVISIONI} attiva={aiDisponibile()} />
      </section>

      {storico.length > 0 && (
        <section className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="font-bold mb-2">Ultime importazioni</h2>
          <ul className="divide-y divide-neutral-100 text-sm">
            {storico.map((i) => (
              <li key={i.id} className="py-1.5 flex flex-wrap gap-x-3">
                <Link href={`/prodotti/articoli/importa/${i.id}`} className="text-blue-800 underline">{i.nomeFile}</Link>
                <span className={i.stato === "ANTEPRIMA" ? "text-amber-700 font-medium" : i.stato === "ESEGUITA" ? "text-green-800" : "text-neutral-500"}>{STATI[i.stato] ?? i.stato}</span>
                {i.stato === "ESEGUITA" && <span className="text-neutral-600">{i.creati} nuovi · {i.aggiornati} aggiornati{i.scartati ? ` · ${i.scartati} scartati` : ""}</span>}
                <span className="text-neutral-500">{i.createdAt.toLocaleString("it-IT")}{i.creataDaNome ? ` · ${i.creataDaNome}` : ""}{i.origine === "AI" ? " · AI" : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
