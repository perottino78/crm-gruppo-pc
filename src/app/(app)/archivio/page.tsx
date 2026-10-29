export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { scopeClienteWhere } from "@/lib/scope";
import { correlatiCliente, titoliEntita, entitaVisibili, NOMI_ENTITA } from "@/lib/documenti/correlati";
import DocumentiCorrelati from "@/components/documenti/DocumentiCorrelati";

type P = { vista?: string; cliente?: string; q?: string; entita?: string; cartella?: string };
const dim = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

/** Archivio file come in Bconsole: per cliente (con tutte le correlazioni) o per tipo di pratica. */
export default async function ArchivioPage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u) notFound();
  const p = await searchParams;
  const perTipo = p.vista === "tipo";
  const pill = (a: boolean) => `px-3 py-1.5 rounded-full text-sm border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`;
  const visibili = entitaVisibili(u);

  let contenuto: React.ReactNode;
  if (!perTipo) {
    const q = p.q?.trim();
    const clienti = q ? await prisma.cliente.findMany({ where: { ...scopeClienteWhere(u), OR: [{ nome: { contains: q, mode: "insensitive" } }, { cognome: { contains: q, mode: "insensitive" } }, { comune: { contains: q, mode: "insensitive" } }] }, select: { id: true, nome: true, cognome: true, comune: true }, take: 30, orderBy: { nome: "asc" } }) : [];
    const scelto = p.cliente ? await prisma.cliente.findFirst({ where: { id: p.cliente, ...scopeClienteWhere(u) }, select: { id: true, nome: true } }) : null;
    contenuto = (
      <div className="space-y-3">
        <form className="flex gap-2"><input type="hidden" name="vista" value="cliente" /><input name="q" defaultValue={q ?? ""} placeholder="Cerca il cliente (nome, cognome, comune)…" className={`${inp} w-80`} /><button className="btn-3d btn-3d-dark text-sm px-3 py-1.5">Cerca</button></form>
        {clienti.length > 0 && <ul className="bg-white border border-neutral-200 rounded-lg divide-y divide-neutral-100">{clienti.map((c) => <li key={c.id}><Link href={`?vista=cliente&cliente=${c.id}`} className="block px-3 py-1.5 text-sm hover:bg-neutral-50">{c.nome} {c.cognome ?? ""} <span className="text-neutral-500">{c.comune ?? ""}</span></Link></li>)}</ul>}
        {q && !clienti.length && <p className="text-sm text-neutral-500">Nessun cliente trovato.</p>}
        {scelto && <DocumentiCorrelati gruppi={await correlatiCliente(u, scelto.id)} titolo={`Cartella di ${scelto.nome}`} />}
        {!scelto && !q && <p className="text-sm text-neutral-600">Scegli un cliente: vedrai in un&apos;unica cartella i suoi documenti, quelli di preventivi e commesse e, per chi ne ha accesso, ordini fornitori, bolle e fatture d&apos;acquisto collegati.</p>}
      </div>
    );
  } else {
    const entita = p.entita && visibili.includes(p.entita) ? [p.entita] : visibili;
    const where: Prisma.DocumentoWhereInput = { entita: { in: entita } };
    if (p.cartella) where.cartella = p.cartella;
    if (p.q?.trim()) where.nome = { contains: p.q.trim(), mode: "insensitive" };
    // il commerciale vede solo i documenti dei propri clienti, preventivi e commesse
    if (u.ruolo === "COMMERCIALE") {
      const [cl, pr, co] = await Promise.all([
        prisma.cliente.findMany({ where: scopeClienteWhere(u), select: { id: true } }),
        prisma.preventivo.findMany({ where: { cliente: scopeClienteWhere(u) }, select: { id: true } }),
        prisma.commessa.findMany({ where: { cliente: scopeClienteWhere(u) }, select: { id: true } }),
      ]);
      where.OR = [{ entita: "CLIENTE", entitaId: { in: cl.map((x) => x.id) } }, { entita: "PREVENTIVO", entitaId: { in: pr.map((x) => x.id) } }, { entita: "COMMESSA", entitaId: { in: co.map((x) => x.id) } }];
    }
    const [docs, cartelle, conteggi] = await Promise.all([
      prisma.documento.findMany({ where, select: { id: true, nome: true, cartella: true, mime: true, dimensione: true, createdAt: true, caricatoDaNome: true, entita: true, entitaId: true }, orderBy: { createdAt: "desc" }, take: 300 }),
      prisma.documento.groupBy({ by: ["cartella"], where: { entita: { in: entita } }, _count: true, orderBy: { cartella: "asc" } }),
      prisma.documento.groupBy({ by: ["entita"], where: { entita: { in: visibili } }, _count: true }),
    ]);
    const titoli = await titoliEntita(docs);
    const qs = (x: Partial<P>) => `?${new URLSearchParams(Object.entries({ ...p, vista: "tipo", ...x }).filter(([, v]) => v) as [string, string][])}`;
    contenuto = (
      <div className="grid md:grid-cols-[220px_1fr] gap-4">
        <nav className="bg-white border border-neutral-200 rounded-lg p-2 text-sm self-start">
          <Link href={qs({ entita: undefined, cartella: undefined })} className={`block px-2 py-1 rounded ${!p.entita ? "bg-neutral-100 font-semibold" : ""}`}>📁 Tutto</Link>
          {visibili.map((e) => <Link key={e} href={qs({ entita: e, cartella: undefined })} className={`block px-2 py-1 rounded ${p.entita === e ? "bg-neutral-100 font-semibold" : ""}`}>📁 {NOMI_ENTITA[e]} <span className="text-neutral-500">({conteggi.find((c) => c.entita === e)?._count ?? 0})</span></Link>)}
          {cartelle.length > 0 && <p className="text-[11px] font-bold text-neutral-500 mt-2 px-2">CARTELLE</p>}
          {cartelle.map((c) => <Link key={c.cartella} href={qs({ cartella: p.cartella === c.cartella ? undefined : c.cartella })} className={`block px-2 py-0.5 rounded text-xs ${p.cartella === c.cartella ? "bg-neutral-100 font-semibold" : ""}`}>📂 {c.cartella} ({c._count})</Link>)}
        </nav>
        <div className="space-y-2">
          <form className="flex gap-2"><input type="hidden" name="vista" value="tipo" />{p.entita && <input type="hidden" name="entita" value={p.entita} />}{p.cartella && <input type="hidden" name="cartella" value={p.cartella} />}<input name="q" defaultValue={p.q ?? ""} placeholder="Nome del file…" className={`${inp} w-72`} /><button className="btn-3d btn-3d-dark text-sm px-3 py-1.5">Cerca</button></form>
          <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50"><th className="p-2">File</th><th>Cartella</th><th>Pratica</th><th>Caricato</th><th className="text-right">Dim.</th></tr></thead>
              <tbody>
                {docs.map((d) => { const t = titoli.get(`${d.entita}:${d.entitaId}`); return (
                  <tr key={d.id} className="border-b border-neutral-100">
                    <td className="p-2"><a href={`/api/documenti/${d.id}`} target="_blank" rel="noopener" className="text-blue-800 underline break-all">{d.nome}</a></td>
                    <td className="text-xs">{d.cartella}</td>
                    <td className="text-xs">{t ? <Link href={t.link} className="underline">{t.titolo}</Link> : NOMI_ENTITA[d.entita]}</td>
                    <td className="text-xs whitespace-nowrap">{d.createdAt.toLocaleDateString("it-IT")}{d.caricatoDaNome ? ` · ${d.caricatoDaNome}` : ""}</td>
                    <td className="text-right text-xs">{dim(d.dimensione)}</td>
                  </tr>
                ); })}
                {docs.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-neutral-500">Nessun file.</td></tr>}
              </tbody>
            </table>
          </div>
          {docs.length === 300 && <p className="text-xs text-neutral-500">Mostrati gli ultimi 300: usa la ricerca o le cartelle per restringere.</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-7xl space-y-4">
      <h1 className="text-2xl font-bold text-neutral-900">📁 Archivio file</h1>
      <div className="flex gap-2"><Link href="?vista=cliente" className={pill(!perTipo)}>Per cliente</Link><Link href="?vista=tipo" className={pill(perTipo)}>Per tipo di pratica</Link></div>
      {contenuto}
    </div>
  );
}
