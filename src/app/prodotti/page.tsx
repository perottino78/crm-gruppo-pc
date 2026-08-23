export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import BrandSwitcher from "@/components/BrandSwitcher";
import { unitaMisura } from "@/lib/prodotti";

const PER_PAGINA = 50;

export default async function ProdottiPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; q?: string; tipologia?: string; pagina?: string }>;
}) {
  const { brand, q, tipologia, pagina } = await searchParams;
  const brandFiltro = brand && brand !== "Tutti" ? { brand: { nome: brand } } : {};
  const paginaAttuale = Math.max(1, Number(pagina) || 1);

  const where = {
    ...brandFiltro,
    ...(tipologia ? { tipologia } : {}),
    ...(q
      ? {
          OR: [
            { tipologia: { contains: q, mode: "insensitive" as const } },
            { colore: { contains: q, mode: "insensitive" as const } },
            { descrizione: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [totaleProdotti, totaleFiltrati, tipologie, prodotti] = await Promise.all([
    prisma.prodotto.count(),
    prisma.prodotto.count({ where }),
    prisma.prodotto.groupBy({ by: ["tipologia"], _count: { tipologia: true }, where: brandFiltro, orderBy: { tipologia: "asc" } }),
    prisma.prodotto.findMany({
      where,
      include: { brand: true },
      orderBy: [{ tipologia: "asc" }, { colore: "asc" }, { altezzaMm: "asc" }],
      skip: (paginaAttuale - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
  ]);

  const totalePagine = Math.max(1, Math.ceil(totaleFiltrati / PER_PAGINA));
  const qs = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (brand) params.set("brand", brand);
    if (q) params.set("q", q);
    if (tipologia) params.set("tipologia", tipologia);
    Object.entries(overrides).forEach(([k, v]) => (v ? params.set(k, v) : params.delete(k)));
    return `?${params.toString()}`;
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Prodotti &amp; listini</h1>
        <BrandSwitcher active={brand ?? "Tutti"} />
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <p className="text-sm text-neutral-600">
          <span className="font-medium">{totaleProdotti}</span> combinazioni tipologia/colore/altezza/larghezza
          importate dai listini fornitore. <span className="font-medium">{totaleFiltrati}</span> corrispondono ai filtri attuali.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-2 mb-4" action="/prodotti" method="get">
        {brand && <input type="hidden" name="brand" value={brand} />}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Cerca</label>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="tipologia, colore, descrizione..."
            className="border border-neutral-200 rounded px-2 py-1.5 text-sm min-w-[220px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Tipologia</label>
          <select name="tipologia" defaultValue={tipologia ?? ""} className="border border-neutral-200 rounded px-2 py-1.5 text-sm min-w-[160px]">
            <option value="">Tutte ({tipologie.length})</option>
            {tipologie.map((t) => (
              <option key={t.tipologia} value={t.tipologia}>
                {t.tipologia} ({t._count.tipologia})
              </option>
            ))}
          </select>
        </div>
        <button className="bg-neutral-900 text-white text-sm rounded px-3 py-1.5">Filtra</button>
        {(q || tipologia) && (
          <Link href={qs({ q: undefined, tipologia: undefined })} className="text-xs text-neutral-400 underline">
            azzera filtri
          </Link>
        )}
      </form>

      <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-400 border-b border-neutral-100">
              <th className="px-4 py-2 font-medium">Brand</th>
              <th className="px-4 py-2 font-medium">Tipologia</th>
              <th className="px-4 py-2 font-medium">Colore</th>
              <th className="px-4 py-2 font-medium">Dimensioni</th>
              <th className="px-4 py-2 font-medium text-right">Prezzo base</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {prodotti.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 text-neutral-500">{p.brand.nome}</td>
                <td className="px-4 py-2 font-medium">{p.tipologia}</td>
                <td className="px-4 py-2">{p.colore}</td>
                <td className="px-4 py-2 text-neutral-500">{p.larghezzaMm} × {p.altezzaMm} {unitaMisura(p.tipologia)}</td>
                <td className="px-4 py-2 text-right">
                  {p.prezzoBase.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/prodotti/modello/${encodeURIComponent(p.tipologia)}`} className="text-xs text-blue-600 underline whitespace-nowrap">
                    scheda tecnica
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {prodotti.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-400">Nessun prodotto corrisponde ai filtri.</p>
        )}
      </div>

      {totalePagine > 1 && (
        <div className="flex items-center gap-3 mt-4 text-sm">
          <Link
            href={qs({ pagina: String(Math.max(1, paginaAttuale - 1)) })}
            className={`px-2 py-1 rounded border border-neutral-200 ${paginaAttuale <= 1 ? "pointer-events-none opacity-30" : ""}`}
          >
            ← precedente
          </Link>
          <span className="text-neutral-400 text-xs">Pagina {paginaAttuale} di {totalePagine}</span>
          <Link
            href={qs({ pagina: String(Math.min(totalePagine, paginaAttuale + 1)) })}
            className={`px-2 py-1 rounded border border-neutral-200 ${paginaAttuale >= totalePagine ? "pointer-events-none opacity-30" : ""}`}
          >
            successiva →
          </Link>
        </div>
      )}
    </div>
  );
}
