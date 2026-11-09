export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STATI_FATTURA, SEZIONALI, sezionale, tipoFattura } from "@/lib/fatturazione/tabelle";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
type P = { stato?: string; anno?: string; sez?: string; q?: string };

/** Fatture fatte nel CRM (bozze, di prova, emesse). Le fatture importate da BConsole restano in Amministrazione › Fatture di vendita. */
export default async function FatturePage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const anno = Number(p.anno) || new Date().getFullYear();
  const fatture = await prisma.fatturaEmessa.findMany({
    where: {
      anno, ...(p.stato ? { stato: p.stato } : {}), ...(p.sez ? { sezionale: p.sez } : {}),
      ...(p.q ? { OR: [{ clienteNome: { contains: p.q, mode: "insensitive" } }, { numero: { contains: p.q, mode: "insensitive" } }, { riferimento: { contains: p.q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ data: "desc" }, { progressivo: "desc" }, { createdAt: "desc" }], take: 500,
  });
  const qs = (x: Partial<P>) => `?${new URLSearchParams(Object.entries({ ...p, ...x }).filter(([, v]) => v) as [string, string][])}`;
  const pill = (a: boolean) => `px-2.5 py-1 rounded-full text-xs border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`;
  const tot = fatture.filter((f) => f.stato === "EMESSA").reduce((t, f) => t + (tipoFattura(f.tipo).notaCredito ? -f.totale : tipoFattura(f.tipo).fiscale ? f.totale : 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 items-center">
        <Link href={qs({ stato: undefined })} className={pill(!p.stato)}>Tutte</Link>
        {Object.entries(STATI_FATTURA).map(([k, v]) => <Link key={k} href={qs({ stato: k })} className={pill(p.stato === k)}>{v.nome}</Link>)}
        <form className="ml-auto flex flex-wrap gap-2">
          {p.stato && <input type="hidden" name="stato" value={p.stato} />}
          <input name="q" defaultValue={p.q ?? ""} placeholder="Cliente, numero…" className="border border-neutral-300 rounded px-2 py-1 text-sm" />
          <select name="sez" defaultValue={p.sez ?? ""} className="border border-neutral-300 rounded px-2 py-1 text-sm"><option value="">Tutti i sezionali</option>{SEZIONALI.map((s) => <option key={s.codice} value={s.codice}>{s.nome}</option>)}</select>
          <input name="anno" type="number" defaultValue={anno} className="border border-neutral-300 rounded px-2 py-1 text-sm w-20" />
          <button className="btn-3d btn-3d-dark text-sm px-3 py-1">Filtra</button>
        </form>
      </div>
      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50"><th className="p-2">Numero</th><th>Data</th><th>Tipo</th><th>Cliente</th><th>Riferimento</th><th className="text-right">Totale</th><th>Stato</th><th className="p-2">File</th></tr></thead>
          <tbody>
            {fatture.map((f) => (
              <tr key={f.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                <td className="p-2 whitespace-nowrap"><Link href={`/fatturazione/fatture/${f.id}`} className="underline font-semibold">{f.numero ?? "bozza"}</Link><span className="block text-[11px] text-neutral-500">{sezionale(f.sezionale).nome}</span></td>
                <td className="whitespace-nowrap">{dataIt(f.data)}</td>
                <td className="text-xs">{tipoFattura(f.tipo).nome}</td>
                <td>{f.clienteNome}</td>
                <td className="text-xs text-neutral-700">{f.riferimento ?? ""}</td>
                <td className="text-right whitespace-nowrap">{eur(f.totale)}</td>
                <td><span className="text-xs font-semibold" style={{ color: STATI_FATTURA[f.stato]?.colore }}>{STATI_FATTURA[f.stato]?.nome}</span></td>
                <td className="p-2 whitespace-nowrap text-xs">
                  <a href={`/api/fatturazione/fattura/${f.id}/pdf`} target="_blank" rel="noreferrer" className="underline">PDF</a>
                  {f.xml && <> · <a href={`/api/fatturazione/fattura/${f.id}/xml`} className="underline">XML</a></>}
                </td>
              </tr>
            ))}
            {fatture.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-neutral-500">Nessuna fattura {p.stato ? "in questo stato" : `nel ${anno}`}. Le nuove si creano da «Da fatturare».</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-600">Totale emesso (note di credito in meno): <b>{eur(tot)}</b>. Le fatture fatte in BConsole sono in <Link href="/amministrazione/fatture-vendita" className="underline">Amministrazione › Fatture di vendita</Link>.</p>
    </div>
  );
}
