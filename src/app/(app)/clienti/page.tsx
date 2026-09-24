export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import BrandSwitcher from "@/components/BrandSwitcher";
import { creaLead, creaCliente, aggiornaFaseLead, convertiLeadInCliente } from "@/app/actions";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { scopeClienteWhere, scopeLeadWhere } from "@/lib/scope";

const FASI = ["NUOVO", "CONTATTATO", "APPUNTAMENTO_FISSATO", "NON_RISPONDE", "NON_INTERESSATO"];

type ClientiSearchParams = {
  brand?: string;
  q?: string;
  indirizzo?: string;
  comune?: string;
  provincia?: string;
  cap?: string;
  paese?: string;
};

export default async function ClientiPage({
  searchParams,
}: {
  searchParams: Promise<ClientiSearchParams>;
}) {
  const { brand, q, indirizzo, comune, provincia, cap, paese } = await searchParams;
  const brandFiltro = brand && brand !== "Tutti" ? { brand: { nome: brand } } : {};
  const utente = await getCurrentUser();
  const clienteScope = utente ? scopeClienteWhere(utente) : {};
  const leadScope = utente ? scopeLeadWhere(utente) : {};

  // Ricerca standard: nome (o ragione sociale), telefono, email in un unico campo.
  const ricercaStd = q?.trim();
  const ricercaStdWhere: Prisma.ClienteWhereInput = ricercaStd
    ? {
        OR: [
          { nome: { contains: ricercaStd, mode: "insensitive" } },
          { telefono: { contains: ricercaStd, mode: "insensitive" } },
          { email: { contains: ricercaStd, mode: "insensitive" } },
        ],
      }
    : {};

  // Ricerca avanzata: indirizzo, comune, provincia, CAP, paese — combinati in AND fra loro.
  const filtriAvanzati: Prisma.ClienteWhereInput[] = [];
  if (indirizzo?.trim()) filtriAvanzati.push({ indirizzo: { contains: indirizzo.trim(), mode: "insensitive" } });
  if (comune?.trim()) filtriAvanzati.push({ comune: { contains: comune.trim(), mode: "insensitive" } });
  if (provincia?.trim()) filtriAvanzati.push({ provincia: { contains: provincia.trim(), mode: "insensitive" } });
  if (cap?.trim()) filtriAvanzati.push({ cap: { contains: cap.trim(), mode: "insensitive" } });
  if (paese?.trim() && paese !== "Tutti") filtriAvanzati.push({ paese: paese.trim() });

  const ricercaAttiva = Boolean(ricercaStd || filtriAvanzati.length > 0);

  const clientiWhere: Prisma.ClienteWhereInput = {
    AND: [brandFiltro, clienteScope, ricercaStdWhere, ...filtriAvanzati],
  };

  const [clienti, lead, brands] = await Promise.all([
    prisma.cliente.findMany({ where: clientiWhere, orderBy: { createdAt: "desc" } }),
    prisma.lead.findMany({
      where: { ...brandFiltro, ...leadScope },
      orderBy: { createdAt: "desc" },
      include: { telefonista: true, brand: true, clienteGenerato: true },
    }),
    prisma.brand.findMany({ orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Clienti</h1>
        <BrandSwitcher active={brand ?? "Tutti"} />
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <form action={creaLead} className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-base font-bold text-neutral-900 mb-3">Nuovo lead</h2>
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
            <button className="btn-3d btn-3d-orange text-sm px-4 py-2 mt-1">Crea lead</button>
          </div>
        </form>

        <form action={creaCliente} className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-base font-bold text-neutral-900 mb-3">Nuovo cliente</h2>
          <div className="flex flex-col gap-2">
            <input name="nome" placeholder="Nome / ragione sociale" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input name="telefono" placeholder="Telefono" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input name="email" placeholder="Email" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input name="indirizzo" placeholder="Indirizzo (via e numero civico)" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <div className="grid grid-cols-3 gap-2">
              <input name="cap" placeholder="CAP" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
              <input name="comune" placeholder="Comune" className="col-span-2 border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <input name="provincia" placeholder="Provincia (es. TO)" maxLength={2} className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
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
            <button className="btn-3d btn-3d-teal text-sm px-4 py-2 mt-1">Crea cliente</button>
          </div>
        </form>
      </div>

      <h2 className="text-base font-bold text-neutral-900 mb-3">
        Lead da Facebook / Instagram ({lead.length})
      </h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-8">
        {lead.map((l) => (
          <div key={l.id} className="flex items-center justify-between px-4 py-3 text-sm gap-3">
            <div>
              <p className="font-medium">{l.nome}</p>
              <p className="text-xs text-neutral-600">
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
                <button className="text-xs text-neutral-600 underline">salva</button>
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
          <p className="px-4 py-6 text-sm text-neutral-600">Nessun lead ancora.</p>
        )}
      </div>

      <h2 className="text-base font-bold text-neutral-900 mb-3">
        Anagrafica clienti ({clienti.length})
      </h2>

      <form action="" method="get" className="bg-white rounded-lg border border-neutral-200 p-4 mb-4">
        <input type="hidden" name="brand" value={brand ?? "Tutti"} />
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Cerca per nome, telefono o email..."
            className="flex-1 border border-neutral-200 rounded px-3 py-2 text-sm"
          />
          <button className="btn-3d btn-3d-teal text-sm px-4 py-2 whitespace-nowrap">Cerca</button>
          {ricercaAttiva && (
            <Link
              href={`/clienti?brand=${encodeURIComponent(brand ?? "Tutti")}`}
              className="text-xs text-neutral-600 underline self-center whitespace-nowrap"
            >
              azzera ricerca
            </Link>
          )}
        </div>

        <details className="mt-3" open={Boolean(indirizzo || comune || provincia || cap || (paese && paese !== "Tutti"))}>
          <summary className="text-xs text-neutral-600 cursor-pointer select-none">🔍 Ricerca avanzata</summary>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
            <input
              type="text"
              name="indirizzo"
              defaultValue={indirizzo ?? ""}
              placeholder="Indirizzo"
              className="border border-neutral-200 rounded px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              name="comune"
              defaultValue={comune ?? ""}
              placeholder="Comune"
              className="border border-neutral-200 rounded px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              name="provincia"
              defaultValue={provincia ?? ""}
              placeholder="Provincia"
              maxLength={2}
              className="border border-neutral-200 rounded px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              name="cap"
              defaultValue={cap ?? ""}
              placeholder="CAP"
              className="border border-neutral-200 rounded px-2 py-1.5 text-sm"
            />
            <select name="paese" defaultValue={paese ?? "Tutti"} className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
              <option value="Tutti">Paese: tutti</option>
              <option value="IT">Italia</option>
              <option value="FR">Francia</option>
              <option value="DE">Germania</option>
              <option value="CH">Svizzera (extra-UE)</option>
            </select>
          </div>
        </details>
      </form>

      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
        {clienti.map((c) => (
          <Link
            key={c.id}
            href={`/clienti/${c.id}`}
            className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50"
          >
            <div>
              <p className="font-medium">{c.nome}</p>
              <p className="text-xs text-neutral-600">
                {c.telefono} · {c.email}
              </p>
              {(c.indirizzo || c.comune) && (
                <p className="text-xs text-neutral-500">
                  {[c.indirizzo, c.cap, c.comune, c.provincia].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
            <span className="text-xs text-neutral-600">{c.paese}</span>
          </Link>
        ))}
        {clienti.length === 0 && ricercaAttiva && (
          <p className="px-4 py-6 text-sm text-neutral-600">Nessun cliente trovato con questi criteri di ricerca.</p>
        )}
        {clienti.length === 0 && !ricercaAttiva && (
          <p className="px-4 py-6 text-sm text-neutral-600">Nessun cliente ancora.</p>
        )}
      </div>
    </div>
  );
}
