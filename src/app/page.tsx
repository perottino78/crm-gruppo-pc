export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import BrandSwitcher from "@/components/BrandSwitcher";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const brandFiltro = brand && brand !== "Tutti" ? { brand: { nome: brand } } : {};

  const [preventiviAperti, valorePipeline, leadDaLavorare] = await Promise.all([
    prisma.preventivo.count({ where: { stato: "APERTO", ...brandFiltro } }),
    prisma.preventivo.aggregate({ _sum: { totaleNetto: true }, where: { stato: "APERTO", ...brandFiltro } }),
    prisma.lead.count({ where: { fase: { in: ["NUOVO", "CONTATTATO"] }, ...brandFiltro } }),
  ]);

  const preventivi = await prisma.preventivo.findMany({
    where: brandFiltro,
    take: 5,
    orderBy: { createdAt: "desc" },
    include: { cliente: true },
  });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
        <BrandSwitcher active={brand ?? "Tutti"} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-neutral-200 border-l-4 border-l-blue-500 p-4 shadow-sm">
          <p className="text-xs font-semibold text-neutral-600 mb-1">Preventivi aperti</p>
          <p className="text-2xl font-bold text-neutral-900">{preventiviAperti}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 border-l-4 border-l-emerald-500 p-4 shadow-sm">
          <p className="text-xs font-semibold text-neutral-600 mb-1">Valore in pipeline</p>
          <p className="text-2xl font-bold text-neutral-900">
            {(valorePipeline._sum.totaleNetto ?? 0).toLocaleString("it-IT", {
              style: "currency",
              currency: "EUR",
            })}
          </p>
        </div>
        <div className="bg-amber-50 rounded-lg border border-amber-200 border-l-4 border-l-amber-500 p-4 shadow-sm">
          <p className="text-xs font-semibold text-amber-800 mb-1">Lead da lavorare</p>
          <p className="text-2xl font-bold text-amber-700">{leadDaLavorare}</p>
        </div>
      </div>

      <h2 className="text-base font-bold text-neutral-900 mb-3">Preventivi recenti</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
        {preventivi.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium">{p.cliente.nome}</span>
            <span className="text-neutral-600">
              {p.totaleNetto.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
            </span>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                p.stato === "APERTO"
                  ? "bg-blue-50 text-blue-700"
                  : p.stato === "ACCETTATO"
                  ? "bg-green-50 text-green-700"
                  : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {p.stato}
            </span>
          </div>
        ))}
        {preventivi.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-600">Nessun preventivo ancora.</p>
        )}
      </div>
    </div>
  );
}
