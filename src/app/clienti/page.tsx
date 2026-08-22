import { prisma } from "@/lib/prisma";
import BrandSwitcher from "@/components/BrandSwitcher";

export default async function ClientiPage() {
  const [clienti, lead] = await Promise.all([
    prisma.cliente.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      include: { telefonista: true, brand: true },
    }),
  ]);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Clienti</h1>
        <BrandSwitcher />
      </div>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">
        Lead da Facebook / Instagram ({lead.length})
      </h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-8">
        {lead.map((l) => (
          <div key={l.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{l.nome}</p>
              <p className="text-xs text-neutral-400">
                {l.fonte} · {l.brand.nome} · assegnato a {l.telefonista?.nome ?? "—"}
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">
              {l.fase}
            </span>
          </div>
        ))}
        {lead.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-400">Nessun lead ancora.</p>
        )}
      </div>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">
        Anagrafica clienti ({clienti.length})
      </h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
        {clienti.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{c.nome}</p>
              <p className="text-xs text-neutral-400">
                {c.telefono} · {c.email}
              </p>
            </div>
            <span className="text-xs text-neutral-400">{c.paese}</span>
          </div>
        ))}
        {clienti.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-400">Nessun cliente ancora.</p>
        )}
      </div>
    </div>
  );
}
