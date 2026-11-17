export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoFareCampagne } from "@/app/campagne-actions";
import { rapportoPerPeriodo, contaInvii, etichettaPeriodo, chiaveMese, chiaveSettimana } from "@/lib/campagne/report";

/** Report delle campagne per settimana o per mese (anche archiviate), con le colonne dei risultati. */
export default async function ReportCampagne({ searchParams }: { searchParams: Promise<{ per?: string; periodo?: string }> }) {
  const u = await getCurrentUser();
  if (!(await puoFareCampagne(u))) notFound();
  const p = await searchParams;
  const per = p.per === "settimana" ? "settimana" : "mese";
  const campagne = await prisma.campagna.findMany({
    where: { inviataIl: { not: null } },
    orderBy: { inviataIl: "desc" },
    select: { id: true, nome: true, inviataIl: true, createdAt: true, archiviataIl: true, abTest: true, invii: { select: { stato: true, apertaIl: true, clicIl: true } } },
  });
  const righe = rapportoPerPeriodo(campagne, per);
  const scelto = righe.find((r) => r.chiave === p.periodo) ?? righe[0];
  const dettaglio = scelto ? campagne.filter((c) => c.inviataIl && c.invii.length && (per === "mese" ? chiaveMese(c.inviataIl) : chiaveSettimana(c.inviataIl)) === scelto.chiave) : [];
  const th = "px-2 py-1.5 text-right font-semibold";
  const td = "px-2 py-1.5 text-right tabular-nums";
  const csv = `/api/campagne/report?per=${per}`;
  return (
    <div className="max-w-6xl space-y-4">
      <Link href="/campagne" className="btn-indietro">← Campagne</Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">📊 Report delle campagne</h1>
          <p className="text-sm text-neutral-600">Tutte le campagne partite, anche quelle archiviate, sommate per {per === "mese" ? "mese" : "settimana"}. Clicca un periodo per vedere campagna per campagna.</p>
        </div>
        <div className="flex gap-2">
          {(["settimana", "mese"] as const).map((x) => (
            <Link key={x} href={`/campagne/report?per=${x}`} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${per === x ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700"}`}>{x === "mese" ? "Mensile" : "Settimanale"}</Link>
          ))}
          <a href={csv} className="btn-3d btn-3d-outline px-3 py-1.5 text-sm">⬇ Excel</a>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-white">
            <tr><th className="px-2 py-1.5 text-left font-semibold">Periodo</th><th className={th}>Campagne</th><th className={th}>Destinatari</th><th className={th}>Inviate</th><th className={th}>Consegnate</th><th className={th}>Rimbalzi</th><th className={th}>Disiscritti</th><th className={th}>Aperte</th><th className={th}>% aperte</th><th className={th}>Clic</th><th className={th}>% clic</th></tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.chiave} className={`border-t border-neutral-200 ${scelto?.chiave === r.chiave ? "bg-amber-50" : ""}`}>
                <td className="px-2 py-1.5"><Link className="font-semibold text-blue-800 hover:underline" href={`/campagne/report?per=${per}&periodo=${r.chiave}`}>{r.etichetta}</Link></td>
                <td className={td}>{r.campagne}</td><td className={td}>{r.destinatari}</td><td className={td}>{r.inviate}</td><td className={td}>{r.consegnate}</td>
                <td className={`${td} ${r.rimbalzate ? "text-red-700" : ""}`}>{r.rimbalzate}</td><td className={td}>{r.disiscritti}</td>
                <td className={td}>{r.aperte}</td><td className={`${td} font-semibold`}>{r.apertePerc}%</td><td className={td}>{r.clic}</td><td className={`${td} font-semibold`}>{r.clicPerc}%</td>
              </tr>
            ))}
            {righe.length === 0 && <tr><td colSpan={11} className="px-3 py-4 text-neutral-600">Nessuna campagna ancora inviata.</td></tr>}
          </tbody>
        </table>
      </div>
      {scelto && (
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-neutral-900">{scelto.etichetta}: campagna per campagna</h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100"><tr><th className="px-2 py-1.5 text-left font-semibold">Campagna</th><th className="px-2 py-1.5 text-left font-semibold">Partita il</th><th className={th}>Destinatari</th><th className={th}>Consegnate</th><th className={th}>Rimbalzi</th><th className={th}>Disiscritti</th><th className={th}>% aperte</th><th className={th}>% clic</th></tr></thead>
              <tbody>
                {dettaglio.map((c) => {
                  const k = contaInvii(c.invii);
                  return (
                    <tr key={c.id} className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><Link className="font-semibold text-blue-800 hover:underline" href={`/campagne/${c.id}`}>{c.abTest ? "🧪 " : ""}{c.nome}</Link>{c.archiviataIl && <span className="ml-1 text-xs text-neutral-500">🗄 archiviata</span>}</td>
                      <td className="px-2 py-1.5">{c.inviataIl!.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</td>
                      <td className={td}>{k.destinatari}</td><td className={td}>{k.consegnate}</td><td className={td}>{k.rimbalzate}</td><td className={td}>{k.disiscritti}</td>
                      <td className={`${td} font-semibold`}>{k.apertePerc}%</td><td className={`${td} font-semibold`}>{k.clicPerc}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500">Consegnate = inviate e non rimbalzate. Le aperte comprendono chi ha cliccato. Periodo: {etichettaPeriodo(scelto.chiave)}.</p>
        </div>
      )}
    </div>
  );
}
