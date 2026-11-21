// Pagamenti segnati a mano senza movimento in prima nota (Debora, 21/11/2026): lista e promemoria per controllarli con l'estratto conto.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { eur, dataIt } from "@/lib/amministrazione/costanti";
import { nomeMetodo } from "@/lib/amministrazione/pagamenti";
import { segnaControllatoEstratto } from "@/app/pagamenti-actions";
import { whereDaControllare } from "@/lib/amministrazione/da-controllare";

export const dynamic = "force-dynamic";

export default async function DaControllarePage() {
  const sel = { id: true, tipo: true, controparte: true, descrizione: true, numeroDocumento: true, pagatoManuale: true, pagataIl: true, metodoPagamento: true, bancaPagamento: true, updatedAt: true, commessaId: true, controllatoEstrattoIl: true, controllatoDaNome: true } as const;
  const [aperti, fatti] = await Promise.all([
    prisma.scadenza.findMany({ where: whereDaControllare(), select: sel, orderBy: { updatedAt: "asc" }, take: 500 }),
    prisma.scadenza.findMany({ where: { controllatoEstrattoIl: { not: null } }, select: sel, orderBy: { controllatoEstrattoIl: "desc" }, take: 30 }),
  ]);
  const riga = (r: (typeof aperti)[number], fatto: boolean) => (
    <tr key={r.id} className="border-t border-neutral-100">
      <td className="px-3 py-2 whitespace-nowrap">{dataIt(r.pagataIl ?? r.updatedAt)}</td>
      <td className="px-3 py-2">{r.tipo === "INCASSO" ? "Incasso" : "Pagamento"} · {r.controparte}</td>
      <td className="px-3 py-2">{r.commessaId ? <Link href={`/commesse/${r.commessaId}`} className="underline">{r.descrizione}</Link> : r.descrizione}{r.numeroDocumento ? ` · doc. ${r.numeroDocumento}` : ""}</td>
      <td className="px-3 py-2 text-xs">{[r.metodoPagamento ? nomeMetodo(r.metodoPagamento) : null, r.bancaPagamento].filter(Boolean).join(" · ") || "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums font-bold">{eur(r.pagatoManuale)}</td>
      <td className="px-3 py-2 text-right">
        {fatto ? (
          <form action={segnaControllatoEstratto} className="inline-flex items-center gap-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="annulla" value="1" /><span className="text-xs text-green-800">✓ {dataIt(r.controllatoEstrattoIl)}{r.controllatoDaNome ? ` · ${r.controllatoDaNome}` : ""}</span><button className="text-xs underline text-neutral-600">rimetti</button></form>
        ) : (
          <form action={segnaControllatoEstratto}><input type="hidden" name="id" value={r.id} /><button className="btn-3d btn-3d-green text-xs px-3 py-1.5">✓ Controllato con l&apos;estratto</button></form>
        )}
      </td>
    </tr>
  );
  const tabella = (righe: typeof aperti, fatto: boolean) => (
    <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs text-neutral-600"><tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Chi</th><th className="px-3 py-2">Scadenza</th><th className="px-3 py-2">Come</th><th className="px-3 py-2 text-right">Importo</th><th className="px-3 py-2"></th></tr></thead>
        <tbody>{righe.map((r) => riga(r, fatto))}{!righe.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">{fatto ? "Ancora nessuno." : "Niente da controllare. 👍"}</td></tr>}</tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">Pagamenti a mano da controllare ({aperti.length})</h2>
        <p className="text-sm text-neutral-600 max-w-2xl">Pagamenti e incassi segnati con «non generare un movimento in prima nota». Quando li ritrovi nell&apos;estratto conto premi «Controllato». Finché ce ne sono, in Dashboard resta il promemoria.</p>
      </div>
      {tabella(aperti, false)}
      <h3 className="font-bold text-neutral-900">Ultimi controllati</h3>
      {tabella(fatti, true)}
    </div>
  );
}
