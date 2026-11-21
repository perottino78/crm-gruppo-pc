export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { reportEconomico, puoVedereReportEconomico } from "@/lib/commesse/report-economico";
import { STATI_COMMESSA, eur } from "@/lib/commesse";
import BottoneStampa from "@/components/BottoneStampa";

const giorno = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });

export default async function ReportEconomicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await getCurrentUser();
  if (!puoVedereReportEconomico(u)) {
    return (
      <div className="max-w-xl p-6">
        <Link href={`/commesse/${id}`} className="btn-indietro">← Torna al progetto</Link>
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Il report economico lo vedono solo l&apos;amministrazione e chi ha il permesso «Report».</p>
      </div>
    );
  }
  const r = await reportEconomico(id);
  if (!r) notFound();
  const st = STATI_COMMESSA[r.stato] ?? { label: r.stato, cls: "bg-neutral-200" };
  const bene = r.margine >= 0;
  const tipi = (Object.keys(r.perTipo) as (keyof typeof r.perTipo)[]).filter((t) => r.perTipo[t] > 0);
  return (
    <div className="max-w-5xl space-y-4 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/commesse/${r.id}`} className="btn-indietro">← Torna al progetto</Link>
        <BottoneStampa />
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-teal-800">📊 Report economico</p>
        <h1 className="text-2xl font-bold text-neutral-900">{r.numero} · {r.cliente}</h1>
        <p className="text-sm text-neutral-600">{r.brand}{r.oggetto ? ` · ${r.oggetto}` : ""} · <span className={`rounded px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span></p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4"><p className="text-xs text-neutral-600">Venduto (imponibile)</p><p className="text-xl font-extrabold">{eur(r.vendutoImponibile)}</p><p className="text-[11px] text-neutral-500">IVA inclusa {eur(r.vendutoIvaInclusa)}</p></div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4"><p className="text-xs text-neutral-600">Costi registrati</p><p className="text-xl font-extrabold">{eur(r.costiTotali)}</p><p className="text-[11px] text-neutral-500">{r.voci.length} voci</p></div>
        <div className={`rounded-xl border p-4 ${bene ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}><p className="text-xs text-neutral-600">Margine</p><p className={`text-xl font-extrabold ${bene ? "text-green-800" : "text-red-800"}`}>{eur(r.margine)}</p></div>
        <div className={`rounded-xl border p-4 ${bene ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}><p className="text-xs text-neutral-600">Margine %</p><p className={`text-xl font-extrabold ${bene ? "text-green-800" : "text-red-800"}`}>{r.marginePerc.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%</p></div>
      </div>
      {r.righeSenzaCosto > 0 && <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">⚠️ {r.righeSenzaCosto} {r.righeSenzaCosto === 1 ? "riga di materiale non ha" : "righe di materiale non hanno"} ancora un costo: il margine è provvisorio.</p>}

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-base font-extrabold text-neutral-900">Dove sono finiti i costi</h2>
        {tipi.length === 0 ? <p className="text-sm text-neutral-500">Nessun costo registrato.</p> : (
          <div className="space-y-2">
            {tipi.map((t) => {
              const quota = r.costiTotali > 0 ? (r.perTipo[t] / r.costiTotali) * 100 : 0;
              return (
                <div key={t}>
                  <div className="flex justify-between text-sm"><span className="font-semibold">{t}</span><span>{eur(r.perTipo[t])} <span className="text-xs text-neutral-500">({quota.toLocaleString("it-IT", { maximumFractionDigits: 0 })}%)</span></span></div>
                  <div className="h-2 rounded bg-neutral-100"><div className="h-2 rounded bg-teal-600" style={{ width: `${quota}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-base font-extrabold text-neutral-900">Dettaglio dei costi</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-neutral-200 text-left text-xs text-neutral-600"><th className="py-1">Data</th><th>Voce</th><th>Tipo</th><th className="text-right">Importo</th></tr></thead>
            <tbody>
              {r.voci.map((v, i) => (
                <tr key={i} className="border-b border-neutral-100"><td className="py-1.5 pr-3 whitespace-nowrap">{giorno(v.data)}</td><td className="pr-3">{v.voce}</td><td className="pr-3 text-xs">{v.tipo}</td><td className="text-right">{eur(v.importo)}</td></tr>
              ))}
              {r.voci.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-neutral-500">Nessun costo registrato.</td></tr>}
            </tbody>
            {r.voci.length > 0 && <tfoot><tr><td colSpan={3} className="pt-2 text-right font-bold">Totale costi</td><td className="pt-2 text-right font-bold">{eur(r.costiTotali)}</td></tr></tfoot>}
          </table>
        </div>
      </section>
      {r.accontoIncassato !== null && <p className="text-xs text-neutral-600">Acconto già incassato dal cliente: {eur(r.accontoIncassato)}.</p>}
    </div>
  );
}
