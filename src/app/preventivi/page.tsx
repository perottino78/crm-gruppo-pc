import { prisma } from "@/lib/prisma";
import BrandSwitcher from "@/components/BrandSwitcher";

const COLONNE = [
  { stato: "APERTO", label: "Aperti" },
  { stato: "ACCETTATO", label: "Accettati" },
  { stato: "SCADUTO", label: "Scaduti" },
];

export default async function PreventiviPage() {
  const preventivi = await prisma.preventivo.findMany({
    include: { cliente: true, commerciale: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Preventivi</h1>
        <BrandSwitcher />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {COLONNE.map((col) => {
          const items = preventivi.filter((p) => p.stato === col.stato);
          return (
            <div key={col.stato}>
              <p className="text-xs font-medium text-neutral-500 mb-2">
                {col.label} · {items.length}
              </p>
              <div className="flex flex-col gap-2">
                {items.map((p) => (
                  <div key={p.id} className="bg-white rounded-lg border border-neutral-200 p-3">
                    <p className="text-sm font-medium">{p.cliente.nome}</p>
                    <p className="text-xs text-neutral-400 mt-1">
                      {p.totaleNetto.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                    </p>
                    <p className="text-xs text-neutral-400">{p.commerciale.nome}</p>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-neutral-300 italic">Vuoto</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
