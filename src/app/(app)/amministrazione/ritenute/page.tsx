// Ritenute 11% incassate (Debora, 21/11/2026): sui bonifici per detrazione la banca trattiene l'11%. Nella scadenza la ritenuta conta come
// pagata ma non è un movimento di banca: qui l'elenco, per anno e per mese, con i totali.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { eur, dataIt } from "@/lib/amministrazione/costanti";

export const dynamic = "force-dynamic";

export default async function RitenutePage({ searchParams }: { searchParams: Promise<{ anno?: string }> }) {
  const p = await searchParams;
  const annoOggi = Number(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }).slice(0, 4));
  const anno = Number(p.anno) || annoOggi;
  const righe = await prisma.scadenza.findMany({
    where: { ritenuta: { gt: 0 }, tipo: "INCASSO" },
    select: { id: true, controparte: true, descrizione: true, numeroDocumento: true, importo: true, ritenuta: true, pagataIl: true, updatedAt: true, commessaId: true, fatturaVenditaId: true },
    orderBy: { updatedAt: "desc" },
    take: 3000,
  });
  const quando = (r: (typeof righe)[number]) => r.pagataIl ?? r.updatedAt;
  const anni = [...new Set(righe.map((r) => Number(quando(r).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }).slice(0, 4))))].sort((a, b) => b - a);
  const dellAnno = righe.filter((r) => Number(quando(r).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }).slice(0, 4)) === anno).sort((a, b) => quando(b).getTime() - quando(a).getTime());
  const perMese = new Map<string, number>();
  for (const r of dellAnno) {
    const m = quando(r).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", month: "long" });
    perMese.set(m, (perMese.get(m) ?? 0) + r.ritenuta);
  }
  const totale = dellAnno.reduce((t, r) => t + r.ritenuta, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Ritenute 11% incassate</h2>
          <p className="text-sm text-neutral-600 max-w-2xl">Bonifici per detrazione: la banca trattiene l&apos;11%. Nella scadenza la ritenuta conta come pagata ma non è un movimento di banca né di prima nota: finisce solo qui.</p>
        </div>
        <div className="flex gap-1">
          {(anni.length ? anni : [anno]).map((a) => (
            <Link key={a} href={`/amministrazione/ritenute?anno=${a}`} className={`px-3 py-1.5 rounded text-sm font-semibold border ${a === anno ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300"}`}>{a}</Link>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="bg-white border border-neutral-200 rounded-lg px-4 py-3"><p className="text-xs text-neutral-500">Totale {anno}</p><p className="text-xl font-extrabold text-neutral-900">{eur(totale)}</p></div>
        {[...perMese.entries()].map(([m, v]) => (
          <div key={m} className="bg-white border border-neutral-200 rounded-lg px-3 py-2"><p className="text-xs text-neutral-500 capitalize">{m}</p><p className="text-sm font-bold tabular-nums">{eur(v)}</p></div>
        ))}
      </div>
      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-600"><tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Scadenza</th><th className="px-3 py-2 text-right">Importo</th><th className="px-3 py-2 text-right">Ritenuta</th></tr></thead>
          <tbody>
            {dellAnno.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="px-3 py-2 whitespace-nowrap">{dataIt(quando(r))}</td>
                <td className="px-3 py-2">{r.controparte}</td>
                <td className="px-3 py-2">{r.commessaId ? <Link href={`/commesse/${r.commessaId}`} className="underline">{r.descrizione}</Link> : r.fatturaVenditaId ? <Link href={`/amministrazione/fatture-vendita/${r.fatturaVenditaId}`} className="underline">{r.descrizione}</Link> : r.descrizione}{r.numeroDocumento ? ` · doc. ${r.numeroDocumento}` : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{eur(r.importo)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{eur(r.ritenuta)}</td>
              </tr>
            ))}
            {!dellAnno.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-500">Nessuna ritenuta nel {anno}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
