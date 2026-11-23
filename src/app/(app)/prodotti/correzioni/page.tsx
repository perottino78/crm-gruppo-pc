export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { correggiOptional, correggiVariante } from "@/app/correzioni-listini-actions";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm w-full";

export default async function CorrezioniListini({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  const { q: qRaw, ok, errore } = await searchParams;
  const q = (qRaw ?? "").trim();
  const puoModificare = puo(u, "listini.modifica");
  const [optional, varianti] = q.length >= 3 ? await Promise.all([
    prisma.optional.findMany({ where: { OR: [{ nome: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }] }, include: { brand: { select: { nome: true } } }, orderBy: [{ nome: "asc" }], take: 40 }),
    prisma.prodotto.groupBy({ by: ["brandId", "tipologia", "colore"], where: { colore: { contains: q, mode: "insensitive" } }, orderBy: { colore: "asc" }, take: 40 }),
  ]) : [[], []];

  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/prodotti" className="btn-indietro">← Prodotti &amp; listini</Link>
      <h1 className="text-2xl font-bold text-neutral-900">✏️ Correggi un refuso nei listini</h1>
      <p className="text-sm text-neutral-700">Scrivi una parola del testo sbagliato (almeno 3 lettere, es. «rufibitura»), poi correggi nome o note. I prezzi non cambiano.</p>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Cerca nel listino…" className={inp} /><button className="btn-3d btn-3d-blue px-4 py-1.5 text-sm">Cerca</button></form>
      {ok && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✓ {ok}</p>}
      {errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">⚠️ {errore}</p>}
      {q.length >= 3 && optional.length + varianti.length === 0 && <p className="text-sm text-neutral-600">Niente trovato per «{q}».</p>}
      {optional.length > 0 && <h2 className="font-semibold text-neutral-900">Optional ({optional.length})</h2>}
      {optional.map((o) => (
        <form key={o.id} action={correggiOptional} className="rounded-lg border border-neutral-200 bg-white p-3 space-y-2">
          <input type="hidden" name="id" value={o.id} /><input type="hidden" name="q" value={q} />
          <p className="text-xs text-neutral-500">{o.brand.nome} · {o.categoria}{o.listino ? ` · ${o.listino}` : ""}</p>
          <label className="block text-xs text-neutral-700">Nome<input name="nome" defaultValue={o.nome} disabled={!puoModificare} className={inp} /></label>
          <label className="block text-xs text-neutral-700">Note<input name="note" defaultValue={o.note ?? ""} disabled={!puoModificare} className={inp} /></label>
          {puoModificare && <button className="btn-3d btn-3d-green px-3 py-1.5 text-sm">💾 Salva la correzione</button>}
        </form>
      ))}
      {varianti.length > 0 && <h2 className="font-semibold text-neutral-900">Colori e varianti dei modelli ({varianti.length})</h2>}
      {varianti.map((v) => (
        <form key={`${v.brandId}|${v.tipologia}|${v.colore}`} action={correggiVariante} className="rounded-lg border border-neutral-200 bg-white p-3 space-y-2">
          <input type="hidden" name="brandId" value={v.brandId} /><input type="hidden" name="tipologia" value={v.tipologia} /><input type="hidden" name="colore" value={v.colore} /><input type="hidden" name="q" value={q} />
          <p className="text-xs text-neutral-500">Modello {v.tipologia.replace(/_/g, " ")} · vale per tutte le misure</p>
          <label className="block text-xs text-neutral-700">Nome<input name="nuovo" defaultValue={v.colore} disabled={!puoModificare} className={inp} /></label>
          {puoModificare && <button className="btn-3d btn-3d-green px-3 py-1.5 text-sm">💾 Salva la correzione</button>}
        </form>
      ))}
    </div>
  );
}
