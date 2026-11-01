export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { residuoScadenza } from "@/lib/amministrazione/server";
import { oggiUtc } from "@/lib/amministrazione/filtri";
import { eur, dataIt } from "@/lib/amministrazione/costanti";
import { STATI_VENDITA, statoVendita } from "@/lib/fatture/vendite";
import { BRANDS } from "@/lib/brands";
import { numeroCommessa } from "@/lib/commesse";
import { creaFatturaVenditaManuale } from "@/app/vendite-actions";
import CaricaFattureXml from "@/components/fatture/CaricaFattureXml";

type P = { stato?: string; q?: string; anno?: string; brand?: string; detrazione?: string; ok?: string; errore?: string };
const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";
const cent = (n: number) => Math.round(n * 100) / 100;

/** Fatture di vendita (fatte in BConsole): scaduto, incassato, da incassare, ritenute 11%. */
export default async function FattureVenditaPage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const anno = Number(p.anno) || new Date().getFullYear();
  const where: Prisma.FatturaVenditaWhereInput = { data: { gte: new Date(`${anno}-01-01T00:00:00Z`), lt: new Date(`${anno + 1}-01-01T00:00:00Z`) } };
  if (p.brand) where.brand = p.brand;
  if (p.detrazione === "1") where.detrazione = true;
  if (p.q?.trim()) { const q = p.q.trim(); where.OR = [{ numero: { contains: q, mode: "insensitive" } }, { clienteNome: { contains: q, mode: "insensitive" } }]; }
  const [fatture, commesse, clienti] = await Promise.all([
    prisma.fatturaVendita.findMany({ where, orderBy: [{ data: "desc" }, { numero: "desc" }], take: 2000 }),
    prisma.commessa.findMany({ where: { stato: { notIn: ["ANNULLATA"] } }, select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } }, orderBy: [{ anno: "desc" }, { numero: "desc" }], take: 1500 }),
    prisma.cliente.findMany({ where: { OR: [{ commesse: { some: {} } }, { categoria: { contains: "Cliente", mode: "insensitive" } }] }, select: { nome: true }, orderBy: { nome: "asc" }, take: 5000 }),
  ]);
  const scadenze = await prisma.scadenza.findMany({ where: { fatturaVenditaId: { in: fatture.map((f) => f.id) } }, include: { abbinamenti: { select: { importo: true } } } });
  const oggi = oggiUtc();
  const righe = fatture.map((f) => {
    const sc = scadenze.filter((s) => s.fatturaVenditaId === f.id).map((s) => ({ ...s, residuo: s.stato === "ANNULLATA" ? 0 : residuoScadenza(s) }));
    const residuo = cent(sc.reduce((t, s) => t + s.residuo, 0));
    const prossima = sc.filter((s) => s.residuo > 0.004).map((s) => s.dataScadenza).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
    return { ...f, residuo, ritenuta: cent(sc.reduce((t, s) => t + s.ritenuta, 0)), prossima, stato: statoVendita(f, sc, oggi) };
  });
  const visibili = p.stato === "da-incassare" ? righe.filter((r) => ["APERTA", "PARZIALE", "SCADUTA"].includes(r.stato)) : p.stato ? righe.filter((r) => r.stato === p.stato) : righe;
  const somma = (k: (r: (typeof righe)[number]) => number, l = righe) => cent(l.reduce((t, r) => t + k(r), 0));
  const fatturato = somma((r) => r.totale), daIncassare = somma((r) => r.residuo), scaduto = somma((r) => r.residuo, righe.filter((r) => r.stato === "SCADUTA")), ritenute = somma((r) => r.ritenuta);
  const qs = (x: Partial<P>) => `?${new URLSearchParams(Object.entries({ ...p, ok: undefined, errore: undefined, ...x }).filter(([, v]) => v) as [string, string][])}`;
  const pill = (a: boolean) => `px-2.5 py-1 rounded-full text-xs border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`;
  const n = (st: string) => righe.filter((r) => r.stato === st).length;

  return (
    <div className="space-y-4">
      {p.ok && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {p.ok}</p>}
      {p.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{p.errore}</p>}
      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="font-bold mb-2">📤 Fatture emesse in BConsole (XML, ZIP)</h2>
          <CaricaFattureXml vendite />
          <p className="text-xs text-neutral-500 mt-2">Il CRM riconosce il cliente (P.IVA, codice fiscale o nome), lo collega alla sua commessa aperta e crea le scadenze di incasso. Se la commessa ha già l&apos;acconto o il saldo da incassare con lo stesso importo, la fattura si aggancia a quello (niente incassi doppi).</p>
        </section>
        <section className="bg-white border border-neutral-200 rounded-lg p-4">
          <details>
            <summary className="cursor-pointer font-bold">✍️ Inserisci una fattura a mano</summary>
            <form action={creaFatturaVenditaManuale} className="grid grid-cols-2 gap-2 mt-2">
              <label className="text-xs font-semibold">Numero<input name="numero" required className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold">Data<input type="date" name="data" required className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold col-span-2">Commessa (scrivi il nome del cliente o il numero)<input name="commessa" list="fv-commesse" placeholder="es. Rossi… oppure C2026-012" className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold col-span-2">…oppure solo il cliente<input name="cliente" list="fv-clienti" className={`${inp} w-full`} /></label>
              <datalist id="fv-commesse">{commesse.map((c) => <option key={c.id} value={`${numeroCommessa(c)} · ${c.cliente.nome}`} />)}</datalist>
              <datalist id="fv-clienti">{clienti.map((c, i) => <option key={i} value={c.nome} />)}</datalist>
              <label className="text-xs font-semibold">Tipo<select name="tipoDocumento" className={`${inp} w-full`}><option value="TD01">Fattura</option><option value="TD02">Fattura di acconto</option><option value="TD04">Nota di credito</option></select></label>
              <label className="text-xs font-semibold">Marchio<select name="brand" className={`${inp} w-full`} defaultValue=""><option value="">—</option>{BRANDS.map((b) => <option key={b.nome}>{b.nome}</option>)}</select></label>
              <label className="text-xs font-semibold">Imponibile €<input name="imponibile" required className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold">IVA €<input name="iva" className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold">Totale € (vuoto = imp. + IVA)<input name="totale" className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold">Scadenza incasso<input type="date" name="scadenza" className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold col-span-2 flex items-center gap-2"><input type="checkbox" name="detrazione" /> Lavoro con detrazione (bonifico parlante: la banca trattiene l&apos;11%)</label>
              <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5 col-span-2">Crea fattura</button>
            </form>
          </details>
        </section>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tot titolo={`Fatturato ${anno} (filtro)`} valore={fatturato} />
        <Tot titolo="Da incassare" valore={daIncassare} cls="text-green-700" />
        <Tot titolo="Di cui scaduto" valore={scaduto} cls="text-red-600" />
        <Tot titolo="Ritenute 11% trattenute" valore={ritenute} cls="text-neutral-700" />
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        <Link href={qs({ stato: undefined })} className={pill(!p.stato)}>Tutte ({righe.length})</Link>
        <Link href={qs({ stato: "da-incassare" })} className={pill(p.stato === "da-incassare")}>Da incassare ({n("APERTA") + n("PARZIALE") + n("SCADUTA")})</Link>
        {["SCADUTA", "PARZIALE", "SALDATA", "NOTA_CREDITO"].map((k) => <Link key={k} href={qs({ stato: k })} className={pill(p.stato === k)}>{STATI_VENDITA[k].nome} ({n(k)})</Link>)}
        <Link href={qs({ detrazione: p.detrazione === "1" ? undefined : "1" })} className={pill(p.detrazione === "1")}>Con detrazione</Link>
      </div>
      <form className="flex flex-wrap gap-2 items-end">
        {p.stato && <input type="hidden" name="stato" value={p.stato} />}
        <input name="q" defaultValue={p.q ?? ""} placeholder="Cliente o numero…" className={inp} />
        <select name="brand" defaultValue={p.brand ?? ""} className={inp}><option value="">Tutti i marchi</option>{BRANDS.map((b) => <option key={b.nome}>{b.nome}</option>)}</select>
        <select name="anno" defaultValue={String(anno)} className={inp}>{[0, 1, 2, 3].map((i) => <option key={i}>{new Date().getFullYear() - i}</option>)}</select>
        <button className="btn-3d btn-3d-dark text-sm px-3 py-1.5">Filtra</button>
      </form>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50 [&>th]:px-2 [&>th]:py-2"><th>Data</th><th>Numero</th><th>Cliente</th><th>Marchio</th><th className="text-right">Totale</th><th className="text-right">Da incassare</th><th>Scadenza</th><th>Stato</th></tr></thead>
          <tbody>
            {visibili.map((f) => {
              const s = STATI_VENDITA[f.stato];
              return (
                <tr key={f.id} className="border-b border-neutral-100 hover:bg-neutral-50 [&>td]:px-2 [&>td]:py-1.5">
                  <td className="whitespace-nowrap">{dataIt(f.data)}</td>
                  <td><Link href={`/amministrazione/fatture-vendita/${f.id}`} className="text-blue-800 underline font-semibold">{f.numero}</Link>{f.detrazione && <span className="block text-[11px] text-purple-800">detrazione</span>}</td>
                  <td>{f.clienteNome}{!f.clienteId && <span className="block text-[11px] text-amber-800">non collegato al CRM</span>}</td>
                  <td className="text-xs">{f.brand ?? f.divisione ?? "—"}</td>
                  <td className="text-right">{eur(f.totale)}</td>
                  <td className="text-right font-semibold">{f.residuo > 0.004 ? eur(f.residuo) : "—"}</td>
                  <td className={`text-xs whitespace-nowrap ${f.stato === "SCADUTA" ? "text-red-600 font-bold" : ""}`}>{f.prossima ? dataIt(f.prossima) : ""}</td>
                  <td><span className={`text-[11px] font-bold px-2 py-0.5 rounded ${s.cls}`}>{s.nome}</span></td>
                </tr>
              );
            })}
            {visibili.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-neutral-500">Nessuna fattura di vendita{righe.length ? " con questi filtri" : ": carica gli XML esportati da BConsole"}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tot({ titolo, valore, cls = "text-neutral-900" }: { titolo: string; valore: number; cls?: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{titolo}</p>
      <p className={`text-lg font-extrabold ${cls}`}>{eur(valore)}</p>
    </div>
  );
}
