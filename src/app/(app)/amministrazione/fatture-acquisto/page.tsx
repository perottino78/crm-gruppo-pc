export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aiDisponibile } from "@/lib/articoli/ai";
import { TIPI_DOCUMENTO } from "@/lib/fatture/fatturapa";
import { BRANDS } from "@/lib/brands";
import { creaFatturaManuale } from "@/app/fatture-actions";
import CaricaFattureXml from "@/components/fatture/CaricaFattureXml";
import LeggiFatturaAI from "@/components/fatture/LeggiFatturaAI";

type P = { stato?: string; fornitore?: string; q?: string; anno?: string };
const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });
const dataIt = (d?: Date | null) => (d ? d.toLocaleDateString("it-IT") : "—");
const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";
const STATI: Record<string, { nome: string; cls: string }> = {
  DA_VERIFICARE: { nome: "Da verificare", cls: "bg-amber-100 text-amber-900" },
  REGISTRATA: { nome: "Registrata", cls: "bg-green-100 text-green-900" },
};

export default async function FattureAcquistoPage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const anno = Number(p.anno) || new Date().getFullYear();
  const where: Prisma.FatturaAcquistoWhereInput = { data: { gte: new Date(`${anno}-01-01T00:00:00Z`), lt: new Date(`${anno + 1}-01-01T00:00:00Z`) } };
  if (p.stato && STATI[p.stato]) where.stato = p.stato;
  if (p.fornitore) where.fornitoreId = p.fornitore;
  if (p.q?.trim()) { const q = p.q.trim(); where.OR = [{ numero: { contains: q, mode: "insensitive" } }, { fornitoreNome: { contains: q, mode: "insensitive" } }, { righe: { some: { descrizione: { contains: q, mode: "insensitive" } } } }]; }
  const [fatture, fornitori, conteggi, commesse] = await Promise.all([
    prisma.fatturaAcquisto.findMany({ where, include: { righe: { select: { commessaId: true } }, bolle: { select: { id: true } } }, orderBy: [{ data: "desc" }, { createdAt: "desc" }], take: 400 }),
    prisma.soggetto.findMany({ where: { attivo: true, ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" }, select: { id: true, ragioneSociale: true } }),
    prisma.fatturaAcquisto.groupBy({ by: ["stato"], where: { data: where.data }, _count: true, _sum: { totale: true } }),
    prisma.commessa.findMany({ where: { stato: { notIn: ["ANNULLATA"] } }, select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } }, orderBy: [{ anno: "desc" }, { numero: "desc" }], take: 300 }),
  ]);
  const c = (s: string) => conteggi.find((x) => x.stato === s);
  const qs = (x: Partial<P>) => `?${new URLSearchParams(Object.entries({ ...p, ...x }).filter(([, v]) => v) as [string, string][])}`;
  const pill = (a: boolean) => `px-2.5 py-1 rounded-full text-xs border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`;
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="font-bold mb-2">📥 Fatture elettroniche (XML, P7M, ZIP)</h2>
          <CaricaFattureXml />
        </section>
        <section className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
          <h2 className="font-bold">📄 Fattura in PDF o cartacea</h2>
          <LeggiFatturaAI attiva={aiDisponibile()} />
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Inserisci a mano</summary>
            <form action={creaFatturaManuale} className="grid grid-cols-2 gap-2 mt-2">
              <label className="text-xs font-semibold col-span-2">Fornitore<select name="fornitoreId" className={`${inp} w-full`} defaultValue=""><option value="">— scegli —</option>{fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}</select></label>
              <label className="text-xs font-semibold col-span-2">…oppure fornitore non in anagrafica<input name="fornitoreNome" className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold">Tipo<select name="tipoDocumento" className={`${inp} w-full`}><option value="TD01">Fattura</option><option value="TD04">Nota di credito</option></select></label>
              <label className="text-xs font-semibold">Società<select name="divisione" className={`${inp} w-full`} defaultValue="P&C">{BRANDS.map((b) => <option key={b.nome}>{b.nome}</option>)}</select></label>
              <label className="text-xs font-semibold">Numero<input name="numero" required className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold">Data<input type="date" name="data" required className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold">Imponibile €<input name="imponibile" required className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold">IVA €<input name="iva" className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold">Totale € (vuoto = imponibile + IVA)<input name="totale" className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold">Scadenza pagamento<input type="date" name="scadenza" className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold col-span-2">Commessa (se è tutta per un cliente)<select name="commessaId" className={`${inp} w-full`} defaultValue=""><option value="">— nessuna / da ripartire —</option>{commesse.map((x) => <option key={x.id} value={x.id}>{x.numero}/{x.anno} {x.cliente.nome}</option>)}</select></label>
              <label className="text-xs font-semibold col-span-2">PDF della fattura<input type="file" name="pdf" accept="application/pdf,image/*" className="block text-sm" /></label>
              <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5 col-span-2">Crea fattura da verificare</button>
            </form>
          </details>
        </section>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        <Link href={qs({ stato: undefined })} className={pill(!p.stato)}>Tutte</Link>
        {Object.entries(STATI).map(([k, s]) => <Link key={k} href={qs({ stato: k })} className={pill(p.stato === k)}>{s.nome} ({c(k)?._count ?? 0}{c(k)?._sum.totale ? ` · ${eur(c(k)!._sum.totale!)}` : ""})</Link>)}
      </div>
      <form className="flex flex-wrap gap-2 items-end">
        {p.stato && <input type="hidden" name="stato" value={p.stato} />}
        <select name="fornitore" defaultValue={p.fornitore ?? ""} className={inp}><option value="">Tutti i fornitori</option>{fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}</select>
        <input name="q" defaultValue={p.q ?? ""} placeholder="Numero, fornitore, descrizione…" className={inp} />
        <select name="anno" defaultValue={String(anno)} className={inp}>{[0, 1, 2].map((i) => <option key={i}>{new Date().getFullYear() - i}</option>)}</select>
        <button className="btn-3d btn-3d-dark text-sm px-3 py-1.5">Filtra</button>
      </form>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50"><th className="p-2">Data</th><th>Numero</th><th>Fornitore</th><th>Società</th><th className="text-right">Imponibile</th><th className="text-right">Totale</th><th>Collegamenti</th><th>Stato</th></tr></thead>
          <tbody>
            {fatture.map((f) => {
              const s = STATI[f.stato] ?? { nome: f.stato, cls: "bg-neutral-100" };
              const comm = new Set(f.righe.map((r) => r.commessaId).filter(Boolean)).size;
              const senza = f.righe.filter((r) => !r.commessaId).length;
              return (
                <tr key={f.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="p-2 whitespace-nowrap">{dataIt(f.data)}</td>
                  <td><Link href={`/amministrazione/fatture-acquisto/${f.id}`} className="text-blue-800 underline font-semibold">{f.numero}</Link>{f.tipoDocumento !== "TD01" ? <span className="block text-[11px] text-neutral-500">{TIPI_DOCUMENTO[f.tipoDocumento] ?? f.tipoDocumento}</span> : null}</td>
                  <td>{f.fornitoreNome}{!f.fornitoreId && <span className="block text-[11px] text-amber-800">non in anagrafica</span>}</td>
                  <td className="text-xs">{f.divisione ?? "—"}</td>
                  <td className="text-right">{eur(f.imponibile)}</td>
                  <td className="text-right font-semibold">{eur(f.totale)}</td>
                  <td className="text-xs">{comm ? `${comm} commess${comm === 1 ? "a" : "e"}` : ""}{senza && comm ? ` · ${senza} righe libere` : ""}{f.bolle.length ? ` · ${f.bolle.length} bolle` : ""}{f.origine === "XML" ? " · XML" : ""}</td>
                  <td><span className={`text-xs px-2 py-0.5 rounded-full ${s.cls}`}>{s.nome}</span></td>
                </tr>
              );
            })}
            {fatture.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-neutral-500">Nessuna fattura d&apos;acquisto.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
