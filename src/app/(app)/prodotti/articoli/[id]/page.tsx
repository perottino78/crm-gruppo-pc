export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoVedereArticoli, puoModificareArticoli, categorieRegola, posizioniListino, assicuraCategorieListino } from "@/lib/articoli/server";
import { alberoCategorie, euro } from "@/lib/articoli/prezzi";
import { DIVISIONI } from "@/lib/articoli/importa";
import { posizioneEffettiva, testoPosizione } from "@/lib/articoli/posizione";
import { categoriaVisibile } from "@/lib/articoli/visibilita";
import { aiDisponibile } from "@/lib/articoli/ai";
import { numeroOrdine, statoOrdine } from "@/lib/ordini/calcoli";
import { caricaFotoArticolo, duplicaArticolo, eliminaArticolo } from "@/app/articoli-actions";
import SchedaArticolo from "@/components/articoli/SchedaArticolo";
import Documenti from "@/components/documenti/Documenti";
import AggiungiArticolo from "@/components/articoli/AggiungiArticolo";
import { totaliDistinta } from "@/lib/articoli/distinta";
import { aggiungiComponente, cambiaQuantitaComponente, togliComponente, ricalcolaDaDistinta, aggiungiCorrelato, togliCorrelato } from "@/app/distinta-actions";

const ORIGINI: Record<string, string> = { MANUALE: "a mano", IMPORTAZIONE: "importazione", REGOLA: "ricalcolo regola", AGGIORNAMENTO: "aggiornamento in blocco", DISTINTA: "ricalcolo dalla distinta (kit)" };

export default async function ArticoloPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ distinta?: string; creato?: string; salvato?: string; f?: string; c?: string; d?: string; m?: string; i?: string; u?: string }> }) {
  const u = await getCurrentUser();
  if (!u || !puoVedereArticoli(u)) notFound();
  const { id } = await params;
  const { distinta: msgDistinta, creato, salvato, f, c: cat0, d, m, i, u: um0 } = await searchParams;
  const nuovo = id === "nuovo";
  const admin = puoModificareArticoli(u);
  if (nuovo && !admin) notFound();
  const posizioni = await posizioniListino();
  if (admin) await assicuraCategorieListino(posizioni);
  const [a, regole, cat, fornitori] = await Promise.all([
    nuovo ? null : prisma.articolo.findUnique({ where: { id }, include: { storico: { orderBy: { createdAt: "desc" }, take: 30 } } }),
    categorieRegola(),
    prisma.categoriaArticolo.findMany({ select: { id: true, nome: true, padreId: true, ordine: true, famiglia: true, gruppoListino: true } }),
    prisma.soggetto.findMany({ where: { ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" }, select: { id: true, ragioneSociale: true, scontoFornitore: true } }),
  ]);
  if (!nuovo && !a) notFound();
  // listino non visibile a questa persona: come se non esistesse
  if (a && !admin) {
    const c = a.categoriaId ? await prisma.categoriaArticolo.findUnique({ where: { id: a.categoriaId }, select: { visibileA: true } }) : null;
    if (c && !categoriaVisibile(c.visibileA, u)) notFound();
  }
  const albero = alberoCategorie(cat).map((c) => ({ ...regole.find((r) => r.id === c.id)!, etichetta: c.etichetta }));
  const usi = a ? await prisma.rigaOrdine.findMany({ where: { articoloId: a.id }, include: { ordineFornitore: { select: { id: true, numero: true, anno: true, stato: true } } }, orderBy: { createdAt: "desc" }, take: 10 }) : [];
  const SEL = { id: true, codice: true, descrizione: true, um: true, costoAcquisto: true, prezzoVendita: true } as const;
  const [componenti, inKit, correlatiA, correlatiDa] = a ? await Promise.all([
    prisma.componenteArticolo.findMany({ where: { articoloId: a.id }, include: { componente: { select: SEL } }, orderBy: [{ ordine: "asc" }, { createdAt: "asc" }] }),
    prisma.componenteArticolo.findMany({ where: { componenteId: a.id }, include: { articolo: { select: SEL } } }),
    prisma.articoloCorrelato.findMany({ where: { articoloId: a.id }, include: { correlato: { select: SEL } } }),
    prisma.articoloCorrelato.findMany({ where: { correlatoId: a.id }, include: { articolo: { select: SEL } } }),
  ]) : [[], [], [], []] as never[][];
  const totKit = totaliDistinta(componenti.map((c) => ({ quantita: c.quantita, costo: c.componente.costoAcquisto, vendita: c.componente.prezzoVendita })));
  const correlati = [...correlatiA.map((c) => ({ id: c.id, art: c.correlato })), ...correlatiDa.map((c) => ({ id: c.id, art: c.articolo }))];
  const { storico, ...dati } = a ?? { storico: [] as never[] };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/prodotti/articoli" className="btn-indietro">← Anagrafica articoli</Link>
          <h1 className="text-2xl font-bold text-neutral-900">{nuovo ? "Nuovo articolo" : <><span className="font-mono text-lg text-neutral-500">{a!.codice}</span> {a!.descrizione}</>}</h1>
          {a && <p className="text-xs text-neutral-500">Ultima modifica {a.updatedAt.toLocaleString("it-IT")}{a.aggiornatoDaNome ? ` · ${a.aggiornatoDaNome}` : ""}{!a.attivo ? " · DISATTIVATO" : ""}</p>}
        </div>
        {a && admin && (
          <div className="flex gap-2">
            <form action={duplicaArticolo}><input type="hidden" name="id" value={a.id} /><button className="btn-3d btn-3d-outline text-sm px-3 py-1.5">Duplica</button></form>
            <form action={eliminaArticolo}><input type="hidden" name="id" value={a.id} /><button className="btn-3d btn-3d-red text-sm px-3 py-1.5">{usi.length ? "Disattiva" : "Elimina"}</button></form>
          </div>
        )}
      </div>
      {creato && <p className="text-sm bg-green-50 border border-green-200 text-green-900 rounded px-3 py-2">✅ Articolo creato.</p>}
      {nuovo && salvato && <p className="text-sm bg-green-50 border border-green-200 text-green-900 rounded px-3 py-2">✅ Articolo <b>{salvato}</b> salvato. Ecco il modulo per il prossimo: fornitore e categoria sono già quelli di prima. <Link href="/prodotti/articoli" className="underline font-bold">Vedi l&apos;elenco</Link></p>}

      <SchedaArticolo
        key={a?.updatedAt.toISOString() ?? `nuovo-${salvato ?? ""}`}
        articolo={nuovo ? { attivo: true, um: um0 ?? "pz", aliquotaIva: i ? Number(i) || 22 : 22, fornitoreId: f ?? null, categoriaId: cat0 ?? null, divisione: d ?? null, marca: m ?? null } : dati}
        categorie={albero} fornitori={fornitori} divisioni={DIVISIONI} modificabile={admin} aiAttiva={aiDisponibile()}
        posizioni={posizioni} posizioneCategoria={Object.fromEntries(cat.map((c) => { const p = posizioneEffettiva(c.id, cat); return [c.id, p ? testoPosizione(p) : ""]; }))}
      />

      {a && (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="bg-white border border-neutral-200 rounded-lg p-4 text-sm">
            <h2 className="font-bold mb-2">🖼 Foto</h2>
            <div className="flex gap-3 items-start">
              {a.immagineUrl ? <img src={a.immagineUrl} alt={a.descrizione} className="w-32 h-32 object-contain rounded border border-neutral-200 bg-neutral-50" /> : <div className="w-32 h-32 rounded bg-neutral-100 flex items-center justify-center text-neutral-400 text-xs">nessuna foto</div>}
              {admin && (
                <form action={caricaFotoArticolo} className="space-y-2">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="file" name="foto" accept="image/jpeg,image/png,image/webp" required className="text-xs" />
                  <button className="btn-3d btn-3d-blue text-xs px-2 py-1">Carica come foto principale</button>
                  <p className="text-xs text-neutral-500">JPG, PNG o WEBP fino a 4 MB. Resta anche nella cartella Foto dei documenti.</p>
                </form>
              )}
            </div>
          </section>
          <section className="bg-white border border-neutral-200 rounded-lg p-4 text-sm">
            <h2 className="font-bold mb-2">📈 Storico prezzi</h2>
            {storico.length === 0 ? <p className="text-neutral-500">Nessuna variazione registrata.</p> : (
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-xs">
                  <thead className="text-neutral-500 text-left"><tr><th className="py-1">Data</th><th className="text-right">Listino</th><th className="text-right">Costo</th><th className="text-right">Vendita</th><th className="pl-2">Origine</th></tr></thead>
                  <tbody className="divide-y divide-neutral-100">
                    {storico.map((s) => (
                      <tr key={s.id}><td className="py-1 whitespace-nowrap">{s.createdAt.toLocaleDateString("it-IT")}</td><td className="text-right">{euro(s.prezzoListino)}</td><td className="text-right">{euro(s.costoAcquisto)}</td><td className="text-right font-medium">{euro(s.prezzoVendita)}</td><td className="pl-2 text-neutral-600">{ORIGINI[s.origine] ?? s.origine}{s.nota ? ` · ${s.nota}` : ""}{s.utenteNome ? ` · ${s.utenteNome}` : ""}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {usi.length > 0 && (
            <section className="bg-white border border-neutral-200 rounded-lg p-4 text-sm lg:col-span-2">
              <h2 className="font-bold mb-2">🚚 Ultimi ordini fornitori</h2>
              <ul className="divide-y divide-neutral-100">
                {usi.map((r) => r.ordineFornitore && (
                  <li key={r.id} className="py-1 flex gap-3"><Link href={`/ordini-fornitori/${r.ordineFornitore.id}`} className="text-blue-800 underline">Ordine {numeroOrdine(r.ordineFornitore)}</Link><span>{r.quantita} {r.um ?? "pz"}</span><span className="text-neutral-500">{statoOrdine(r.ordineFornitore.stato).nome}</span><span className="text-neutral-500">{r.createdAt.toLocaleDateString("it-IT")}</span></li>
                ))}
              </ul>
            </section>
          )}
          <section id="distinta" className="bg-white border border-neutral-200 rounded-lg p-4 text-sm lg:col-span-2 scroll-mt-4">
            <h2 className="font-bold mb-1">🧰 Distinta base (kit) · più materiali con un prezzo</h2>
            <p className="text-xs text-neutral-600 mb-2">Aggiungi i pezzi che compongono il kit con la loro quantità, poi «Ricalcola prezzi»: costo e prezzo del kit diventano la somma dei pezzi. Il prezzo si può ancora correggere a mano nella scheda qui sopra.</p>
            {msgDistinta && <p className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-amber-900">{msgDistinta}</p>}
            {componenti.length === 0 ? <p className="text-neutral-500">Nessun pezzo: questo articolo non è un kit.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-neutral-500 text-left"><tr><th className="py-1">Codice</th><th>Nome</th><th className="text-right">Quantità</th><th className="text-right">Costo un.</th><th className="text-right">Costo</th><th className="text-right">Vendita un.</th><th className="text-right">Vendita</th><th /></tr></thead>
                  <tbody className="divide-y divide-neutral-100">
                    {componenti.map((c) => (
                      <tr key={c.id}>
                        <td className="py-1 font-mono">{c.componente.codice}</td>
                        <td><Link href={`/prodotti/articoli/${c.componente.id}`} className="text-blue-800 underline">{c.componente.descrizione}</Link></td>
                        <td className="text-right">{admin ? (
                          <form action={cambiaQuantitaComponente} className="inline-flex items-center gap-1"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="articoloId" value={a.id} /><input name="quantita" defaultValue={String(c.quantita).replace(".", ",")} className="w-16 border border-neutral-300 rounded px-1 py-0.5 text-right" /><button className="text-blue-800 underline">ok</button></form>
                        ) : c.quantita} {c.componente.um}</td>
                        <td className="text-right">{euro(c.componente.costoAcquisto)}</td>
                        <td className="text-right">{c.componente.costoAcquisto === null ? "—" : euro(c.quantita * c.componente.costoAcquisto)}</td>
                        <td className="text-right">{euro(c.componente.prezzoVendita)}</td>
                        <td className="text-right font-medium">{c.componente.prezzoVendita === null ? "—" : euro(c.quantita * c.componente.prezzoVendita)}</td>
                        <td className="text-right">{admin && <form action={togliComponente}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="articoloId" value={a.id} /><button className="text-red-700 underline">togli</button></form>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="font-bold"><td colSpan={4} className="py-1 text-right">Totale kit</td><td className="text-right">{euro(totKit.costo)}</td><td /><td className="text-right">{euro(totKit.vendita)}</td><td /></tr></tfoot>
                </table>
              </div>
            )}
            {admin && (
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <AggiungiArticolo azione={aggiungiComponente} articoloId={a.id} conQuantita bottone="➕ Aggiungi al kit" />
                {componenti.length > 0 && <form action={ricalcolaDaDistinta}><input type="hidden" name="articoloId" value={a.id} /><button className="btn-3d btn-3d-blue text-sm px-3 py-1.5">🔄 Ricalcola prezzi da distinta</button></form>}
              </div>
            )}
            {inKit.length > 0 && (
              <p className="mt-3 text-xs"><b>Compare nei kit:</b> {inKit.map((k, i) => <span key={k.id}>{i > 0 && ", "}<Link href={`/prodotti/articoli/${k.articolo.id}`} className="text-blue-800 underline">{k.articolo.codice} {k.articolo.descrizione}</Link> (× {k.quantita})</span>)}</p>
            )}
          </section>
          <section id="correlati" className="bg-white border border-neutral-200 rounded-lg p-4 text-sm lg:col-span-2 scroll-mt-4">
            <h2 className="font-bold mb-1">🔗 Prodotti correlati</h2>
            <p className="text-xs text-neutral-600 mb-2">Materiali che di solito servono insieme a questo: il legame vale nei due sensi.</p>
            {correlati.length === 0 ? <p className="text-neutral-500">Nessun prodotto correlato.</p> : (
              <ul className="divide-y divide-neutral-100">
                {correlati.map((c) => (
                  <li key={c.id} className="py-1 flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs text-neutral-500">{c.art.codice}</span>
                    <Link href={`/prodotti/articoli/${c.art.id}`} className="text-blue-800 underline">{c.art.descrizione}</Link>
                    <span className="text-xs text-neutral-500">vendita {euro(c.art.prezzoVendita)}/{c.art.um}</span>
                    {admin && <form action={togliCorrelato}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="articoloId" value={a.id} /><button className="text-xs text-red-700 underline">togli</button></form>}
                  </li>
                ))}
              </ul>
            )}
            {admin && <AggiungiArticolo azione={aggiungiCorrelato} articoloId={a.id} bottone="🔗 Correla" />}
          </section>
          <div className="lg:col-span-2"><Documenti entita="ARTICOLO" entitaId={a.id} titolo="Documenti dell'articolo" /></div>
        </div>
      )}
    </div>
  );
}
