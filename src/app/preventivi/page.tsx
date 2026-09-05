export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import BrandSwitcher from "@/components/BrandSwitcher";
import { creaPreventivo, aggiornaStatoPreventivo } from "@/app/actions";
import Link from "next/link";

const COLONNE = [
  { stato: "APERTO", label: "Aperti" },
  { stato: "ACCETTATO", label: "Accettati" },
  { stato: "SCADUTO", label: "Scaduti" },
  { stato: "ANNULLATO", label: "Annullati" },
];

export default async function PreventiviPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const brandFiltro = brand && brand !== "Tutti" ? { brand: { nome: brand } } : {};

  const [preventivi, clienti, brands, commerciali] = await Promise.all([
    prisma.preventivo.findMany({
      where: brandFiltro,
      include: { cliente: true, commerciale: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cliente.findMany({ where: brandFiltro, orderBy: { nome: "asc" } }),
    prisma.brand.findMany({ orderBy: { nome: "asc" } }),
    prisma.utente.findMany({ where: { ruolo: "COMMERCIALE" }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Preventivi</h1>
        <BrandSwitcher active={brand ?? "Tutti"} />
      </div>

      <form action={creaPreventivo} className="bg-white rounded-lg border border-neutral-200 p-4 mb-8 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-700">Cliente</label>
          <select name="clienteId" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm min-w-[160px]">
            <option value="">Seleziona...</option>
            {clienti.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-700">Commerciale</label>
          <select name="commercialeId" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm min-w-[160px]">
            <option value="">Seleziona...</option>
            {commerciali.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-700">Brand</label>
          <select name="brandId" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm min-w-[140px]">
            <option value="">Seleziona...</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.nome}</option>
            ))}
          </select>
        </div>
        <button className="btn-3d btn-3d-green text-sm px-4 py-2">Nuovo preventivo</button>
        <p className="text-xs text-neutral-600 w-full">Le righe prodotto/prezzo si aggiungono in una fase successiva.</p>
      </form>

      <div className="grid grid-cols-4 gap-4">
        {COLONNE.map((col) => {
          const items = preventivi.filter((p) => p.stato === col.stato);
          return (
            <div key={col.stato}>
              <p className="text-xs font-medium text-neutral-700 mb-2">
                {col.label} · {items.length}
              </p>
              <div className="flex flex-col gap-2">
                {items.map((p) => (
                  <div key={p.id} className="bg-white rounded-lg border border-neutral-200 p-3">
                    <Link href={`/preventivi/${p.id}`} className="text-sm font-medium hover:underline">
                      {p.cliente.nome}
                    </Link>
                    <p className="text-xs text-neutral-600 mt-1">
                      {p.totaleNetto.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                    </p>
                    <p className="text-xs text-neutral-600">{p.commerciale.nome}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {COLONNE.filter((c) => c.stato !== p.stato).map((c) => (
                        <form key={c.stato} action={aggiornaStatoPreventivo}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="stato" value={c.stato} />
                          <button className="text-[11px] text-neutral-600 hover:text-neutral-700 underline">
                            → {c.label.toLowerCase()}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-neutral-500 italic">Vuoto</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
