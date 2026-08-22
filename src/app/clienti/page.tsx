export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import BrandSwitcher from "@/components/BrandSwitcher";
import { creaLead, creaCliente, aggiornaFaseLead, convertiLeadInCliente } from "@/app/actions";

const FASI = ["NUOVO", "CONTATTATO", "APPUNTAMENTO_FISSATO", "NON_RISPONDE", "NON_INTERESSATO"];

export default async function ClientiPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const brandFiltro = brand && brand !== "Tutti" ? { brand: { nome: brand } } : {};

  const [clienti, lead, brands] = await Promise.all([
    prisma.cliente.findMany({ where: brandFiltro, orderBy: { createdAt: "desc" } }),
    prisma.lead.findMany({
      where: brandFiltro,
      orderBy: { createdAt: "desc" },
      include: { telefonista: true, brand: true, clienteGenerato: true },
    }),
    prisma.brand.findMany({ orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Clienti</h1>
        <BrandSwitcher active={brand ?? "Tutti"} />
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <form action={creaLead} className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium text-neutral-700 mb-3">Nuovo lead</h2>
          <div className="flex flex-col gap-2">
            <input name="nome" placeholder="Nome" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input name="telefono" placeholder="Telefono" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input name="email" placeholder="Email" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <select name="fonte" defaultValue="facebook" className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="telefono">Telefono</option>
              <option value="altro">Altro</option>
            </select>
            <select name="brandId" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
              <option value="">Brand...</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.nome}</option>
              ))}
            </select>
            <button className="bg-neutral-900 text-white text-sm rounded px-3 py-1.5 mt-1">Crea lead</button>
          </div>
        </form>

        <form action={creaCliente} className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium text-neutral-700 mb-3">Nuovo cliente</h2>
          <div className="flex flex-col gap-2">
            <input name="nome" placeholder="Nome / ragione sociale" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input name="telefono" placeholder="Telefono" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input name="email" placeholder="Email" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input name="indirizzo" placeholder="Indirizzo" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <select name="paese" defaultValue="IT" className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
              <option value="IT">Italia</option>
              <option value="FR">Francia</option>
              <option value="DE">Germania</option>
              <option value="CH">Svizzera (extra-UE)</option>
            </select>
            <select name="brandId" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
              <option value="">Brand...</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.nome}</option>
              ))}
            </select>
            <button className="bg-neutral-900 text-white text-sm rounded px-3 py-1.5 mt-1">Crea cliente</button>
          </div>
        </form>
      </div>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">
        Lead da Facebook / Instagram ({lead.length})
      </h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-8">
        {lead.map((l) => (
          <div key={l.id} className="flex items-center justify-between px-4 py-3 text-sm gap-3">
            <div>
              <p className="font-medium">{l.nome}</p>
              <p className="text-xs text-neutral-400">
                {l.fonte} · {l.brand.nome} · assegnato a {l.telefonista?.nome ?? "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <form action={aggiornaFaseLead} className="flex items-center gap-1">
                <input type="hidden" name="id" value={l.id} />
                <select
                  name="fase"
                  defaultValue={l.fase}
                  className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600 border-0"
                >
                  {FASI.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <button className="text-xs text-neutral-400 underline">salva</button>
              </form>
              {!l.clienteGenerato && (
                <form action={convertiLeadInCliente}>
                  <input type="hidden" name="id" value={l.id} />
                  <button className="text-xs text-blue-600 underline whitespace-nowrap">→ crea cliente</button>
                </form>
              )}
            </div>
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
