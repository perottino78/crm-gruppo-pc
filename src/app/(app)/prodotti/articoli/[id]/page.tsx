export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoVedereArticoli, puoModificareArticoli, categorieRegola } from "@/lib/articoli/server";
import { alberoCategorie, euro } from "@/lib/articoli/prezzi";
import { DIVISIONI } from "@/lib/articoli/importa";
import { aiDisponibile } from "@/lib/articoli/ai";
import { numeroOrdine, statoOrdine } from "@/lib/ordini/calcoli";
import { caricaFotoArticolo, duplicaArticolo, eliminaArticolo } from "@/app/articoli-actions";
import SchedaArticolo from "@/components/articoli/SchedaArticolo";
import Documenti from "@/components/documenti/Documenti";

const ORIGINI: Record<string, string> = { MANUALE: "a mano", IMPORTAZIONE: "importazione", REGOLA: "ricalcolo regola", AGGIORNAMENTO: "aggiornamento in blocco" };

export default async function ArticoloPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ creato?: string }> }) {
  const u = await getCurrentUser();
  if (!u || !puoVedereArticoli(u)) notFound();
  const { id } = await params;
  const { creato } = await searchParams;
  const nuovo = id === "nuovo";
  const admin = puoModificareArticoli(u);
  if (nuovo && !admin) notFound();
  const [a, regole, cat, fornitori] = await Promise.all([
    nuovo ? null : prisma.articolo.findUnique({ where: { id }, include: { storico: { orderBy: { createdAt: "desc" }, take: 30 } } }),
    categorieRegola(),
    prisma.categoriaArticolo.findMany({ select: { id: true, nome: true, padreId: true, ordine: true } }),
    prisma.soggetto.findMany({ where: { ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" }, select: { id: true, ragioneSociale: true, scontoFornitore: true } }),
  ]);
  if (!nuovo && !a) notFound();
  const albero = alberoCategorie(cat).map((c) => ({ ...regole.find((r) => r.id === c.id)!, etichetta: c.etichetta }));
  const usi = a ? await prisma.rigaOrdine.findMany({ where: { articoloId: a.id }, include: { ordineFornitore: { select: { id: true, numero: true, anno: true, stato: true } } }, orderBy: { createdAt: "desc" }, take: 10 }) : [];
  const { storico, ...dati } = a ?? { storico: [] as never[] };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/prodotti/articoli" className="text-sm text-blue-800 underline">← Anagrafica articoli</Link>
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

      <SchedaArticolo
        key={a?.updatedAt.toISOString() ?? "nuovo"}
        articolo={nuovo ? { attivo: true, um: "pz", aliquotaIva: 22 } : dati}
        categorie={albero} fornitori={fornitori} divisioni={DIVISIONI} modificabile={admin} aiAttiva={aiDisponibile()}
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
          <div className="lg:col-span-2"><Documenti entita="ARTICOLO" entitaId={a.id} titolo="Documenti dell'articolo" /></div>
        </div>
      )}
    </div>
  );
}
