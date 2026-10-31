export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import BrandSwitcher from "@/components/BrandSwitcher";
import { creaLead, creaCliente, convertiLeadInCliente } from "@/app/actions";
import { FASI_LEAD } from "@/lib/automazioni/percorsi";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { scopeClienteWhere, scopeLeadWhere } from "@/lib/scope";
import { PROVENIENZE, NESSUNA, whereFiltriClienti, filtriCampagnaAttivi } from "@/lib/clienti/provenienza";
import { daOraRoma, aggiungiGiorni } from "@/lib/calendario/tempo";


// Quante righe mostrare (lead: ?lead=, anagrafica clienti: ?clienti=): di default le 10
// piu' recenti, poi 20/50/100/tutte a scelta, per non dover scorrere liste lunghissime.
const LEAD_PER_PAGINA = ["10", "20", "50", "100", "tutti"] as const;
const LEAD_DEFAULT = "10";
const leggiQuante = (v: string | undefined) => ((LEAD_PER_PAGINA as readonly string[]).includes(v ?? "") ? v! : LEAD_DEFAULT);
const quanteTake = (v: string) => (v === "tutti" ? undefined : Number(v));

// Data/ora di arrivo del lead nel CRM, sempre in ora italiana (il server Vercel e' in UTC).
const formatoArrivo = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
function arrivoLead(d: Date): string {
  const parti = Object.fromEntries(formatoArrivo.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parti.day}/${parti.month}/${parti.year} alle ${parti.hour}:${parti.minute}`;
}

type ClientiSearchParams = {
  brand?: string;
  q?: string;
  indirizzo?: string;
  comune?: string;
  provincia?: string;
  cap?: string;
  paese?: string;
  lead?: string;
  clienti?: string;
  provenienza?: string;
  stato?: string;
  commerciale?: string;
  dal?: string;
  al?: string;
};

export default async function ClientiPage({
  searchParams,
}: {
  searchParams: Promise<ClientiSearchParams>;
}) {
  const filtri = await searchParams;
  const { brand, q, indirizzo, comune, provincia, cap, paese, lead: leadParam, clienti: clientiParam, provenienza, stato, commerciale, dal, al } = filtri;
  const leadMostrati = leggiQuante(leadParam);
  const leadTake = quanteTake(leadMostrati);
  const clientiMostrati = leggiQuante(clientiParam);
  const clientiTake = quanteTake(clientiMostrati);
  // Link "Mostra: 10/20/50/100/tutti" che conserva brand, ricerca e l'altra scelta.
  const hrefQuante = (cambia: { lead?: string; clienti?: string }) => {
    const parametri = new URLSearchParams();
    for (const [k, v] of Object.entries({ brand, q, indirizzo, comune, provincia, cap, paese, provenienza, stato, commerciale, dal, al })) if (v) parametri.set(k, v);
    const l = cambia.lead ?? leadMostrati;
    const c = cambia.clienti ?? clientiMostrati;
    if (l !== LEAD_DEFAULT) parametri.set("lead", l);
    if (c !== LEAD_DEFAULT) parametri.set("clienti", c);
    return `/clienti${parametri.toString() ? `?${parametri.toString()}` : ""}`;
  };
  const classePulsante = (attivo: boolean) =>
    `px-2 py-1 rounded border ${attivo ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50"}`;
  const brandFiltro = brand && brand !== "Tutti" ? { brand: { nome: brand } } : {};
  const utente = await getCurrentUser();
  const clienteScope = utente ? scopeClienteWhere(utente) : {};
  const leadScope = utente ? scopeLeadWhere(utente) : {};

  // Filtri dell'elenco clienti (ricerca, indirizzo e campagne): stessa funzione dell'esportazione
  const dataDa = dal ? daOraRoma(`${dal}T00:00`) : null;
  const dataA = al ? daOraRoma(`${aggiungiGiorni(al, 1)}T00:00`) : null;
  const condizioni = whereFiltriClienti({ ...filtri, brand: undefined }, dataDa, dataA);
  const ricercaStd = q?.trim();
  const ricercaAttiva = condizioni.length > 0;
  const clientiWhere: Prisma.ClienteWhereInput = { AND: [brandFiltro, clienteScope, ...condizioni] };
  // Per le tendine dei filtri: valori presenti con quanti clienti (solo quelli che l'utente può vedere)
  const scopeEBrand: Prisma.ClienteWhereInput = { AND: [brandFiltro, clienteScope] };
  const isAdmin = utente?.ruolo === "AMMINISTRATORE";
  const parametriEsporta = new URLSearchParams();
  for (const [k, v] of Object.entries({ brand, q, indirizzo, comune, provincia, cap, paese, provenienza, stato, commerciale, dal, al })) if (v) parametriEsporta.set(k, v);

  // Ricerca lead: nome, telefono, email
  const leadRicercaWhere: Prisma.LeadWhereInput = ricercaStd
    ? {
        OR: [
          { nome: { contains: ricercaStd, mode: "insensitive" } },
          { telefono: { contains: ricercaStd, mode: "insensitive" } },
          { email: { contains: ricercaStd, mode: "insensitive" } },
        ],
      }
    : {};

  const leadWhere: Prisma.LeadWhereInput = { AND: [brandFiltro, leadScope, leadRicercaWhere] };
  const [clienti, clientiTotali, lead, leadTotali, brands, perProvenienza, perStato, commerciali] = await Promise.all([
    prisma.cliente.findMany({ where: clientiWhere, orderBy: { createdAt: "desc" }, take: clientiTake, include: { brand: true, responsabile: { select: { nome: true } } } }),
    prisma.cliente.count({ where: clientiWhere }),
    prisma.lead.findMany({
      where: leadWhere,
      orderBy: { createdAt: "desc" },
      take: leadTake,
      include: { telefonista: true, brand: true, clienteGenerato: true },
    }),
    prisma.lead.count({ where: leadWhere }),
    prisma.brand.findMany({ orderBy: { nome: "asc" } }),
    prisma.cliente.groupBy({ by: ["origine"], where: scopeEBrand, _count: { _all: true }, orderBy: { _count: { origine: "desc" } } }),
    prisma.cliente.groupBy({ by: ["statoLead"], where: scopeEBrand, _count: { _all: true }, orderBy: { _count: { statoLead: "desc" } } }),
    isAdmin ? prisma.utente.findMany({ where: { clientiResponsabile: { some: {} } }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">Clienti</h1>
        <BrandSwitcher active={brand ?? "Tutti"} />
      </div>

      {/* Barra di ricerca unificata — filtra sia lead che clienti */}
      <form action="" method="get" className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <input type="hidden" name="brand" value={brand ?? "Tutti"} />
        {leadMostrati !== LEAD_DEFAULT && <input type="hidden" name="lead" value={leadMostrati} />}
        {clientiMostrati !== LEAD_DEFAULT && <input type="hidden" name="clienti" value={clientiMostrati} />}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Cerca per nome, telefono o email…"
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
          <summary className="text-xs text-neutral-600 cursor-pointer select-none">🔍 Ricerca avanzata per indirizzo (solo clienti)</summary>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
            <input type="text" name="indirizzo" defaultValue={indirizzo ?? ""} placeholder="Via" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input type="text" name="comune" defaultValue={comune ?? ""} placeholder="Comune" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input type="text" name="provincia" defaultValue={provincia ?? ""} placeholder="Prov." maxLength={2} className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input type="text" name="cap" defaultValue={cap ?? ""} placeholder="CAP" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <select name="paese" defaultValue={paese ?? "Tutti"} className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
              <option value="Tutti">Paese: tutti</option>
              <option value="IT">Italia</option>
              <option value="FR">Francia</option>
              <option value="DE">Germania</option>
              <option value="CH">Svizzera (extra-UE)</option>
            </select>
          </div>
        </details>

        {/* Filtri campagne: provenienza, stato del lead, commerciale e periodo di arrivo (solo clienti) */}
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <p className="text-xs font-semibold text-neutral-700 mb-2">📣 Filtri campagne</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <select name="provenienza" defaultValue={provenienza ?? ""} className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
              <option value="">Provenienza: tutte</option>
              {perProvenienza.filter((r) => r.origine && r.origine !== "NON INDICATA").map((r) => (
                <option key={r.origine} value={r.origine!}>{r.origine} ({r._count._all})</option>
              ))}
              <option value={NESSUNA}>Non indicata ({perProvenienza.filter((r) => !r.origine || r.origine === "NON INDICATA").reduce((t, r) => t + r._count._all, 0)})</option>
            </select>
            <select name="stato" defaultValue={stato ?? ""} className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
              <option value="">Stato lead: tutti</option>
              {perStato.filter((r) => r.statoLead).map((r) => (
                <option key={r.statoLead} value={r.statoLead!}>{r.statoLead} ({r._count._all})</option>
              ))}
              <option value={NESSUNA}>Senza stato ({perStato.filter((r) => !r.statoLead).reduce((t, r) => t + r._count._all, 0)})</option>
            </select>
            {isAdmin ? (
              <select name="commerciale" defaultValue={commerciale ?? ""} className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
                <option value="">Commerciale: tutti</option>
                {commerciali.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                <option value={NESSUNA}>Nessun commerciale</option>
              </select>
            ) : <span />}
            <label className="flex items-center gap-1 text-xs text-neutral-600">dal
              <input type="date" name="dal" defaultValue={dal ?? ""} className="flex-1 border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            </label>
            <label className="flex items-center gap-1 text-xs text-neutral-600">al
              <input type="date" name="al" defaultValue={al ?? ""} className="flex-1 border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button className="btn-3d btn-3d-purple text-sm px-4 py-2">Applica filtri</button>
            <a href={`/api/clienti/esporta?${parametriEsporta.toString()}`} className="btn-3d btn-3d-green text-sm px-4 py-2">⬇ Esporta per Excel</a>
            <a href={`/api/clienti/esporta?formato=facebook&${parametriEsporta.toString()}`} className="btn-3d btn-3d-blue text-sm px-4 py-2">⬇ Esporta per Facebook</a>
            {filtriCampagnaAttivi(filtri) && <span className="text-xs text-neutral-600">Esportano i {clientiTotali} clienti filtrati.</span>}
          </div>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <form action={creaLead} className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-base font-bold text-neutral-900 mb-3">Nuovo lead</h2>
          <div className="flex flex-col gap-2">
            <input name="nome" placeholder="Nome" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input name="telefono" placeholder="Telefono" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <input name="email" placeholder="Email" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            <select name="fonte" defaultValue="FACEBOOK" className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
              {PROVENIENZE.map((p) => <option key={p} value={p}>{p}</option>)}
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
            <select name="origine" required defaultValue="" className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
              <option value="" disabled>Da dove arriva? (provenienza)</option>
              {PROVENIENZE.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className="btn-3d btn-3d-teal text-sm px-4 py-2 mt-1">Crea cliente</button>
          </div>
        </form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-bold text-neutral-900">
          Lead da Facebook / Instagram ({leadTotali})
          {lead.length < leadTotali && (
            <span className="ml-2 text-xs font-normal text-neutral-600">
              ultimi {lead.length} di {leadTotali}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-neutral-600 mr-1">Mostra:</span>
          {LEAD_PER_PAGINA.map((n) => (
            <Link key={n} href={hrefQuante({ lead: n })} scroll={false} className={classePulsante(n === leadMostrati)}>
              {n}
            </Link>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-8">
        {lead.map((l) => (
          <div key={l.id} className="flex items-center justify-between px-4 py-3 text-sm gap-3">
            <div>
              <p className="font-medium">{l.nome}</p>
              <p className="text-xs text-neutral-800">
                🕒 Arrivato il {arrivoLead(l.createdAt)}
              </p>
              {(l.telefono || l.email) && (
                <p className="text-xs text-neutral-600">
                  {[l.telefono, l.email].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="text-xs text-neutral-600">
                {l.fonte} · {l.brand.nome} · assegnato a {l.telefonista?.nome ?? "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/lead?id=${l.id}`} className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-700 whitespace-nowrap">
                {FASI_LEAD[l.fase]?.nome ?? l.fase} · lavora →
              </Link>
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

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-bold text-neutral-900">
          Anagrafica clienti ({clientiTotali})
          {clienti.length < clientiTotali && (
            <span className="ml-2 text-xs font-normal text-neutral-600">
              {ricercaAttiva ? "mostrati" : "ultimi"} {clienti.length} di {clientiTotali}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-neutral-600 mr-1">Mostra:</span>
          {LEAD_PER_PAGINA.map((n) => (
            <Link key={n} href={hrefQuante({ clienti: n })} scroll={false} className={classePulsante(n === clientiMostrati)}>
              {n}
            </Link>
          ))}
        </div>
      </div>

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
                {[c.telefono, c.email].filter(Boolean).join(" · ")}
              </p>
              {(c.indirizzo || c.comune) && (
                <p className="text-xs text-neutral-500">
                  {[c.indirizzo, c.cap, c.comune, c.provincia].filter(Boolean).join(", ")}
                </p>
              )}
              <p className="flex flex-wrap gap-1 mt-1">
                {c.origine && c.origine !== "NON INDICATA" && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800">📣 {c.origine}</span>}
                {c.statoLead && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-900">{c.statoLead}</span>}
                {c.responsabile && <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">👤 {c.responsabile.nome}</span>}
              </p>
            </div>
            <span className="text-xs text-neutral-600 text-right">{c.brand.nome}<br />{c.paese}</span>
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
