export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { salvaModelloProdotto } from "@/app/actions";

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
        <button className="bg-neutral-900 text-white text-sm rounded px-3 py-1.5 self-start">Salva scheda</button>
      </form>
    </div>
  );
}
