export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { numeroCommessa } from "@/lib/commesse";
import { SEZIONALI, STATI_DDT, TIPI_FATTURA } from "@/lib/fatturazione/tabelle";
import { numeroDdt } from "@/lib/fatturazione/calcoli";
import { creaFattura, creaDdt, fatturaDaDdt } from "@/app/fatturazione-actions";
import ClientePicker from "@/components/calendario/ClientePicker";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
const oggi = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

/** «Da fatturare»: commesse senza fattura di acconto o di saldo, DDT da fatturare, bozze in corso e scorciatoie. */
export default async function DaFatturarePage({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  const { errore } = await searchParams;
  const [commesse, ddt, bozze, ddtBozze] = await Promise.all([
    prisma.commessa.findMany({
      where: { stato: { notIn: ["ANNULLATA", "CHIUSA"] }, chiusaIl: null, ordineBC: null },
      select: { id: true, numero: true, anno: true, stato: true, totaleVendita: true, accontoImporto: true, accontoIncassato: true, saldoIncassato: true, cliente: { select: { nome: true } }, brand: { select: { nome: true } } },
      orderBy: [{ anno: "desc" }, { numero: "desc" }], take: 300,
    }),
    prisma.ddtUscita.findMany({ where: { stato: { in: ["DA_FATTURARE", "PARZ_FATTURATO"] }, numero: { not: null } }, include: { righe: { select: { prezzo: true, quantita: true, fatturata: true } } }, orderBy: [{ clienteNome: "asc" }, { anno: "asc" }, { numero: "asc" }] }),
    prisma.fatturaEmessa.findMany({ where: { stato: "BOZZA" }, orderBy: { updatedAt: "desc" }, take: 30 }),
    prisma.ddtUscita.findMany({ where: { stato: "BOZZA" }, orderBy: { updatedAt: "desc" }, take: 30 }),
  ]);
  const ids = commesse.map((c) => c.id);
  const [crm, bc] = await Promise.all([
    prisma.fatturaEmessa.findMany({ where: { commessaId: { in: ids }, stato: { in: ["EMESSA", "PROVA", "BOZZA"] } }, select: { commessaId: true, tipo: true, stato: true } }),
    prisma.fatturaVendita.findMany({ where: { commessaId: { in: ids } }, select: { commessaId: true, tipoDocumento: true } }),
  ]);
  const haAcconto = (id: string) => crm.some((f) => f.commessaId === id && f.tipo === "ACCONTO") || bc.some((f) => f.commessaId === id && f.tipoDocumento === "TD02");
  const haSaldo = (id: string) => crm.some((f) => f.commessaId === id && ["SALDO", "FATTURA", "DIFFERITA", "ACCOMPAGNATORIA"].includes(f.tipo)) || bc.some((f) => f.commessaId === id && f.tipoDocumento !== "TD02" && f.tipoDocumento !== "TD04");
  const daFatturare = commesse.map((c) => ({ c, acconto: !haAcconto(c.id), saldo: !haSaldo(c.id) })).filter((x) => x.acconto || x.saldo);
  const perCliente = new Map<string, typeof ddt>();
  for (const d of ddt) { const k = d.clienteId ?? d.clienteNome; perCliente.set(k, [...(perCliente.get(k) ?? []), d]); }

  return (
    <div className="space-y-6">
      {errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{errore}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={creaFattura} className="card-fase space-y-2">
          <h2 className="font-bold text-neutral-900">🧾 Nuova fattura</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-neutral-700">Tipo
              <select name="tipo" className={`${inp} w-full`} defaultValue="FATTURA">{TIPI_FATTURA.filter((t) => t.codice !== "DIFFERITA").map((t) => <option key={t.codice} value={t.codice}>{t.nome}</option>)}</select>
            </label>
            <label className="text-xs text-neutral-700">Sezionale
              <select name="sezionale" className={`${inp} w-full`} defaultValue="">{[<option key="" value="">dal marchio del cliente</option>, ...SEZIONALI.map((s) => <option key={s.codice} value={s.codice}>{s.nome} (…/{s.estensione}/anno)</option>)]}</select>
            </label>
          </div>
          <label className="block text-xs text-neutral-700">Cliente <ClientePicker endpoint="/api/fatturazione/clienti" /></label>
          <label className="block text-xs text-neutral-700">Data <input type="date" name="data" defaultValue={oggi()} className={inp} /></label>
          <button className="btn-3d btn-3d-green text-sm px-4 py-2">Crea la bozza</button>
          <p className="text-[11px] text-neutral-600">Per acconto e saldo di una pratica usa i pulsanti della commessa qui sotto: le righe si compilano da sole.</p>
        </form>
        <form action={creaDdt} className="card-fase space-y-2">
          <h2 className="font-bold text-neutral-900">🚚 Nuovo DDT di uscita</h2>
          <label className="block text-xs text-neutral-700">Cliente <ClientePicker endpoint="/api/fatturazione/clienti" /></label>
          <label className="block text-xs text-neutral-700">Data <input type="date" name="data" defaultValue={oggi()} className={inp} /></label>
          <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Crea la bozza del DDT</button>
          <p className="text-[11px] text-neutral-600">Dalla commessa (qui sotto) il DDT parte già con le voci dell&apos;offerta.</p>
        </form>
      </div>

      {(bozze.length > 0 || ddtBozze.length > 0) && (
        <section className="card-fase">
          <h2 className="font-bold text-neutral-900 mb-2">✏️ Bozze in corso</h2>
          <ul className="text-sm divide-y divide-neutral-100">
            {bozze.map((f) => <li key={f.id} className="py-1.5"><Link href={`/fatturazione/fatture/${f.id}`} className="underline">{TIPI_FATTURA.find((t) => t.codice === f.tipo)?.nome} — {f.clienteNome}</Link> <span className="text-neutral-600">· {eur(f.totale)} · creata da {f.creatoDaNome ?? "—"}</span></li>)}
            {ddtBozze.map((d) => <li key={d.id} className="py-1.5"><Link href={`/fatturazione/ddt/${d.id}`} className="underline">DDT — {d.clienteNome}</Link> <span className="text-neutral-600">· {dataIt(d.data)} · creato da {d.creatoDaNome ?? "—"}</span></li>)}
          </ul>
        </section>
      )}

      <section className="card-fase">
        <h2 className="font-bold text-neutral-900">🚚 DDT da fatturare ({ddt.length})</h2>
        <p className="text-xs text-neutral-600 mb-2">Spunta i DDT dello stesso cliente e crea la fattura differita (come «Genera fattura» di BConsole).</p>
        {ddt.length === 0 ? <p className="text-sm text-neutral-500">Nessun DDT da fatturare.</p> : [...perCliente.entries()].map(([k, lista]) => (
          <form key={k} action={fatturaDaDdt} className="border-t border-neutral-100 py-2">
            <input type="hidden" name="ritorno" value="/fatturazione" />
            <p className="text-sm font-semibold text-neutral-900">{lista[0].clienteNome}</p>
            <div className="flex flex-wrap gap-3 my-1">
              {lista.map((d) => (
                <label key={d.id} className="text-sm flex items-center gap-1.5">
                  <input type="checkbox" name="ddtId" value={d.id} defaultChecked />
                  <Link href={`/fatturazione/ddt/${d.id}`} className="underline">{numeroDdt(d)}</Link>
                  <span className="text-neutral-600">del {dataIt(d.data)} · {eur(d.righe.filter((r) => !r.fatturata).reduce((t, r) => t + r.prezzo * r.quantita, 0))}</span>
                  <span className="text-[11px] font-semibold" style={{ color: STATI_DDT[d.stato]?.colore }}>{STATI_DDT[d.stato]?.nome}</span>
                </label>
              ))}
            </div>
            <button className="btn-3d btn-3d-green text-xs px-3 py-1.5">Crea la fattura differita</button>
          </form>
        ))}
      </section>

      <section className="card-fase">
        <h2 className="font-bold text-neutral-900">📁 Pratiche da fatturare ({daFatturare.length})</h2>
        <p className="text-xs text-neutral-600 mb-2">Commesse aperte senza fattura di acconto o di saldo (contano anche quelle importate da BConsole).</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200"><th className="py-1.5">Commessa</th><th>Cliente</th><th>Marchio</th><th className="text-right">Totale</th><th className="text-right">Acconto</th><th>Crea</th></tr></thead>
            <tbody>
              {daFatturare.map(({ c, acconto, saldo }) => (
                <tr key={c.id} className="border-b border-neutral-100">
                  <td className="py-1.5"><Link href={`/commesse/${c.id}`} className="underline">{numeroCommessa(c)}</Link></td>
                  <td>{c.cliente.nome}</td>
                  <td className="text-xs">{c.brand.nome}</td>
                  <td className="text-right whitespace-nowrap">{eur(c.totaleVendita)}</td>
                  <td className="text-right whitespace-nowrap text-xs">{c.accontoImporto ? eur(c.accontoImporto) : "—"}{c.accontoIncassato ? " ✓ incassato" : ""}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex flex-wrap gap-1 py-1">
                      {acconto && <form action={creaFattura}><input type="hidden" name="commessaId" value={c.id} /><input type="hidden" name="tipo" value="ACCONTO" /><button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">Fattura acconto</button></form>}
                      {saldo && <form action={creaFattura}><input type="hidden" name="commessaId" value={c.id} /><input type="hidden" name="tipo" value="SALDO" /><button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">Fattura saldo</button></form>}
                      <form action={creaDdt}><input type="hidden" name="commessaId" value={c.id} /><button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">DDT</button></form>
                    </div>
                  </td>
                </tr>
              ))}
              {daFatturare.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-neutral-500">Tutte le pratiche aperte hanno le loro fatture.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
