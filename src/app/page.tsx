export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import BrandSwitcher from "@/components/BrandSwitcher";

export default async function DashboardPage() {
  const [preventiviAperti, valorePipeline, leadDaLavorare] = await Promise.all([
    prisma.preventivo.count({ where: { stato: "APERTO" } }),
    prisma.preventivo.aggregate({ _sum: { totaleNetto: true }, where: { stato: "APERTO" } }),
    prisma.lead.count({ where: { fase: { in: ["NUOVO", "CONTATTATO"] } } }),
  ]);

  const preventivi = await prisma.preventivo.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: { cliente: true },
  });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Dashboard</h1>
        <BrandSwitcher />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <p className="text-xs text-neutral-400 mb-1">Preventivi aperti</p>
          <p className="text-2xl font-medium">{preventiviAperti}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <p className="text-xs text-neutral-400 mb-1">Valore in pipeline</p>
          <p className="text-2xl font-medium">
            {(valorePipeline._sum.totaleNetto ?? 0).toLocaleString("it-IT", {
              style: "currency",
              currency: "EUR",
            })}
          </p>
        </div>
        <div className="bg-amber-50 rounded-lg border border-amber-100 p-4">
          <p className="text-xs text-amber-700 mb-1">Lead da lavorare</p>
          <p className="text-2xl font-medium text-amber-700">{leadDaLavorare}</p>
        </div>
      </div>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">Preventivi recenti</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
        {preventivi.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium">{p.cliente.nome}</span>
            <span className="text-neutral-400">
              {p.totaleNetto.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
            </span>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                p.stato === "APERTO"
                  ? "bg-blue-50 text-blue-700"
                  : p.stato === "ACCETTATO"
                  ? "bg-green-50 text-green-700"
                  : "bg-neutral-100 text-neutral-500"
              }`}
            >
              {p.stato}
            </span>
          </div>
        ))}
        {preventivi.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-400">Nessun preventivo ancora.</p>
        )}
      </div>
    </div>
  );
}
