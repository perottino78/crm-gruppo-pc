export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import BrandSwitcher from "@/components/BrandSwitcher";
import { unitaMisura } from "@/lib/prodotti";

const PER_PAGINA = 50;

export default async function ProdottiPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; q?: string; tipologia?: string; famiglia?: string; gruppo?: string; pagina?: string }>;
}) {
  const { brand, q, tipologia, famiglia, gruppo, pagina } = await searchParams;
  const brandFiltro = brand && brand !== "Tutti" ? { brand: { nome: brand } } : {};
  const paginaAttuale = Math.max(1, Number(pagina) || 1);

  const modelli = await prisma.modelloProdotto.findMany({
    where: brand && brand !== "Tutti" ? { brand: { nome: brand } } : {},
  });
  const modelloMap = new Map(modelli.map((m) => [m.tipologia, m]));

  const famiglieDisponibili = [...new Set(modelli.map((m) => m.famiglia).filter((f): f is string => !!f))].sort();
  const gruppiDisponibili = [...new Set(modelli.filter((m) => !famiglia || m.famiglia === famiglia).map((m) => m.gruppo).filter((g): g is string => !!g))].sort();

  let tipologieFamigliaGruppo: string[] | null = null;
  if (famiglia || gruppo) {
    tipologieFamigliaGruppo = modelli
      .filter((m) => (!famiglia || m.famiglia === famiglia) && (!gruppo || m.gruppo === gruppo))
      .map((m) => m.tipologia);
  }

  const where = {
    ...brandFiltro,
    ...(tipologia ? { tipologia } : {}),
    ...(tipologieFamigliaGruppo ? { tipologia: { in: tipologieFamigliaGruppo } } : {}),
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
    if (famiglia) params.set("famiglia", famiglia);
    if (gruppo) params.set("gruppo", gruppo);
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

      {famiglieDisponibili.length > 0 && (
        <div className="flex gap-2 mb-4">
          <Link
            href={qs({ famiglia: undefined, gruppo: undefined })}
            className={`text-xs px-3 py-1.5 rounded-full border ${!famiglia ? "bg-neutral-900 text-white border-neutral-900" : "border-neutral-200 text-neutral-500"}`}
          >
            Tutte le famiglie
          </Link>
          {famiglieDisponibili.map((f) => (
            <Link
              key={f}
              href={qs({ famiglia: f, gruppo: undefined })}
              className={`text-xs px-3 py-1.5 rounded-full border ${famiglia === f ? "bg-neutral-900 text-white border-neutral-900" : "border-neutral-200 text-neutral-500"}`}
            >
              {f}
            </Link>
          ))}
        </div>
      )}

      {famiglia && gruppiDisponibili.length > 0 && (
        <div className="flex gap-2 mb-4">
          {gruppiDisponibili.map((g) => (
            <Link
              key={g}
              href={qs({ gruppo: g === gruppo ? undefined : g })}
              className={`text-xs px-3 py-1.5 rounded-full border ${gruppo === g ? "bg-blue-50 text-blue-700 border-blue-200" : "border-neutral-200 text-neutral-500"}`}
            >
              {g}
            </Link>
          ))}
        </div>
      )}

      <form className="flex flex-wrap items-end gap-2 mb-4" action="/prodotti" method="get">
        {brand && <input type="hidden" name="brand" value={brand} />}
        {famiglia && <input type="hidden" name="famiglia" value={famiglia} />}
        {gruppo && <input type="hidden" name="gruppo" value={gruppo} />}
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
              <th className="px-4 py-2 font-medium"></th>
              <th className="px-4 py-2 font-medium">Brand</th>
              <th className="px-4 py-2 font-medium">Tipologia</th>
              <th className="px-4 py-2 font-medium">Colore</th>
              <th className="px-4 py-2 font-medium">Dimensioni</th>
              <th className="px-4 py-2 font-medium text-right">Prezzo base</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {prodotti.map((p) => {
              const modello = modelloMap.get(p.tipologia);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-2">
                    {modello?.immagineUrl ? (
                      <img src={modello.immagineUrl} alt={p.tipologia} className="w-8 h-8 object-cover rounded border border-neutral-200" />
                    ) : (
                      <span className="w-8 h-8 block rounded bg-neutral-50 border border-dashed border-neutral-200" />
                    )}
                  </td>
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
              );
            })}
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
