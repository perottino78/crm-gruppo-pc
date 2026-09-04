export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { salvaModelloProdotto } from "@/app/actions";
import { listinoDiTipologia } from "@/lib/prodotti";

export default async function ModelloProdottoPage({
  params,
}: {
  params: Promise<{ tipologia: string }>;
}) {
  const { tipologia: tipologiaParam } = await params;
  const tipologia = decodeURIComponent(tipologiaParam);

  const primoProdotto = await prisma.prodotto.findFirst({ where: { tipologia }, include: { brand: true } });
  if (!primoProdotto) notFound();

  const [varianti, modello] = await Promise.all([
    prisma.prodotto.count({ where: { tipologia } }),
    prisma.modelloProdotto.findUnique({
      where: { brandId_tipologia: { brandId: primoProdotto.brandId, tipologia } },
    }),
  ]);

  // Pannelli/optional con immagine applicabili a questa scheda (stesso filtro usato in
  // preventivi per popolare il menu a tendina): listino a livello di famiglia/tipologia,
  // gruppo merceologico corrispondente. Raggruppati per categoria, una miniatura ciascuna
  // (molte righe della stessa categoria — es. le varie essenze di uno stesso modello di
  // pannello — condividono la stessa immagine di riferimento).
  const listino = listinoDiTipologia(tipologia);
  const optionaliConImmagine = modello?.gruppo
    ? await prisma.optional.findMany({
        where: {
          brandId: primoProdotto.brandId,
          gruppiApplicabili: { has: modello.gruppo },
          immagineUrl: { not: null },
          OR: [{ listino: null }, { listino }, { listino: tipologia }],
        },
        orderBy: [{ categoria: "asc" }],
      })
    : [];
  const categorieUniche = new Map<string, { categoria: string; immagineUrl: string; count: number }>();
  for (const o of optionaliConImmagine) {
    if (!o.immagineUrl) continue;
    const esistente = categorieUniche.get(o.categoria);
    if (esistente) esistente.count++;
    else categorieUniche.set(o.categoria, { categoria: o.categoria, immagineUrl: o.immagineUrl, count: 1 });
  }
  const galleriaPannelli = [...categorieUniche.values()];

  return (
    <div className="max-w-2xl">
      <Link href="/prodotti" className="text-xs text-neutral-400 hover:underline">
        ← Prodotti &amp; listini
      </Link>
      <h1 className="text-xl font-medium mt-2 mb-1">{tipologia.replace(/_/g, " ")}</h1>
      <p className="text-sm text-neutral-400 mb-6">
        {primoProdotto.brand.nome} · {varianti} varianti dimensionali collegate a questa scheda
      </p>

      {modello?.immagineUrl && (
        <img
          src={modello.immagineUrl}
          alt={tipologia}
          className="w-full max-h-80 object-cover rounded-lg border border-neutral-200 mb-4"
        />
      )}

      <form action={salvaModelloProdotto} className="bg-white rounded-lg border border-neutral-200 p-4 flex flex-col gap-3">
        <input type="hidden" name="brandId" value={primoProdotto.brandId} />
        <input type="hidden" name="tipologia" value={tipologia} />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">URL immagine</label>
          <input
            name="immagineUrl"
            defaultValue={modello?.immagineUrl ?? ""}
            placeholder="https://..."
            className="border border-neutral-200 rounded px-2 py-1.5 text-sm"
          />
          <p className="text-[11px] text-neutral-300">
            Incolla il link di un&apos;immagine già online (es. da Google Drive con condivisione pubblica, o da un tuo sito). Il caricamento diretto di file non è ancora supportato.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Descrizione tecnica</label>
          <textarea
            name="descrizioneTecnica"
            defaultValue={modello?.descrizioneTecnica ?? ""}
            rows={6}
            className="border border-neutral-200 rounded px-2 py-1.5 text-sm"
            placeholder="Materiali, finiture, caratteristiche tecniche da mostrare in offerta..."
          />
        </div>
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-neutral-500">Famiglia</label>
            <select name="famiglia" defaultValue={modello?.famiglia ?? ""} className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
              <option value="">—</option>
              <option value="OUTDOOR">Outdoor</option>
              <option value="INDOOR">Indoor</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-neutral-500">Gruppo</label>
            <input
              name="gruppo"
              defaultValue={modello?.gruppo ?? ""}
              placeholder="es. Pergole, Serramenti, Zanzariere..."
              className="border border-neutral-200 rounded px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <button className="btn-3d btn-3d-dark text-sm px-4 py-2 self-start">Salva scheda</button>
      </form>

      {galleriaPannelli.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-neutral-700 mb-1">
            Pannelli / disegni disponibili ({galleriaPannelli.length} categorie a listino)
          </h2>
          <p className="text-xs text-neutral-400 mb-3">
            Anteprima delle pagine catalogo fornitore corrispondenti — utile per mostrare le opzioni al cliente prima di scegliere l&apos;optional in offerta.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {galleriaPannelli.map((g) => (
              <div key={g.categoria} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                <img src={g.immagineUrl} alt={g.categoria} className="w-full h-40 object-cover object-top" />
                <div className="px-2 py-1.5">
                  <p className="text-[11px] font-medium text-neutral-700 leading-tight">{g.categoria}</p>
                  {g.count > 1 && <p className="text-[10px] text-neutral-400">{g.count} varianti a listino</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
