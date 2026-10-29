export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CAUSALI_MOVIMENTO } from "@/lib/magazzino/calcoli";
import { numeroCommessa } from "@/lib/commesse";
import { movimentoManuale } from "@/app/magazzino-actions";

type P = { articolo?: string; tipo?: string };
const q = (n: number) => String(n).replace(".", ",");
const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";

export default async function MovimentiPage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const where: Prisma.MovimentoMagazzinoWhereInput = {};
  if (p.tipo) where.tipo = p.tipo;
  const cerca = p.articolo?.trim();
  if (cerca) {
    const art = await prisma.articolo.findMany({ where: { OR: [{ codice: { contains: cerca.split(" — ")[0], mode: "insensitive" } }, { descrizione: { contains: cerca, mode: "insensitive" } }] }, select: { id: true }, take: 200 });
    where.articoloId = { in: art.map((a) => a.id) };
  }
  const [movimenti, catalogo, commesse] = await Promise.all([
    prisma.movimentoMagazzino.findMany({ where, orderBy: [{ data: "desc" }, { createdAt: "desc" }], take: 400 }),
    prisma.articolo.findMany({ where: { attivo: true }, select: { codice: true, descrizione: true }, orderBy: { codice: "asc" }, take: 5000 }),
    prisma.commessa.findMany({ where: { stato: { notIn: ["CHIUSA", "ANNULLATA"] } }, select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } }, orderBy: [{ anno: "desc" }, { numero: "desc" }], take: 300 }),
  ]);
  const ids = [...new Set(movimenti.map((m) => m.articoloId))];
  const idComm = [...new Set(movimenti.map((m) => m.commessaId).filter(Boolean))] as string[];
  const [articoli, commMov, bolle] = await Promise.all([
    prisma.articolo.findMany({ where: { id: { in: ids } }, select: { id: true, codice: true, descrizione: true, um: true } }),
    prisma.commessa.findMany({ where: { id: { in: idComm } }, select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } } }),
    prisma.bollaEntrata.findMany({ where: { id: { in: [...new Set(movimenti.map((m) => m.bollaId).filter(Boolean))] as string[] } }, select: { id: true, numero: true, anno: true } }),
  ]);
  return (
    <div className="space-y-3">
      <form action={movimentoManuale} className="bg-white border border-neutral-200 rounded-lg p-3 grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
        <span className="text-xs font-bold col-span-2 md:col-span-12">Movimento manuale</span>
        <label className="text-xs font-semibold col-span-2 md:col-span-4">Articolo<input name="articolo" list="cat-mov" required className={`${inp} w-full`} /></label>
        <datalist id="cat-mov">{catalogo.map((a) => <option key={a.codice} value={`${a.codice} — ${a.descrizione}`} />)}</datalist>
        <label className="text-xs font-semibold md:col-span-2">Tipo<select name="tipo" className={`${inp} w-full`}><option value="CARICO">Carico</option><option value="SCARICO">Scarico / prelievo</option><option value="RETTIFICA_PIU">Rettifica +</option><option value="RETTIFICA_MENO">Rettifica −</option></select></label>
        <label className="text-xs font-semibold md:col-span-1">Q.tà<input name="quantita" required className={`${inp} w-full`} /></label>
        <label className="text-xs font-semibold md:col-span-1">Costo €<input name="costo" placeholder="carico" className={`${inp} w-full`} /></label>
        <label className="text-xs font-semibold col-span-2 md:col-span-3">Per commessa (prelievo)<select name="commessaId" defaultValue="" className={`${inp} w-full`}><option value="">—</option>{commesse.map((c) => <option key={c.id} value={c.id}>{numeroCommessa(c)} {c.cliente.nome}</option>)}</select></label>
        <label className="text-xs font-semibold col-span-2 md:col-span-10">Note<input name="note" className={`${inp} w-full`} placeholder="es. reso al fornitore, materiale danneggiato, consumo officina" /></label>
        <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5 md:col-span-2">Registra</button>
      </form>

      <form className="flex flex-wrap gap-2">
        <input name="articolo" list="cat-mov" defaultValue={p.articolo ?? ""} placeholder="Filtra per articolo" className={`${inp} w-72`} />
        <select name="tipo" defaultValue={p.tipo ?? ""} className={inp}><option value="">Tutti i tipi</option>{["CARICO", "SCARICO", "RETTIFICA", "INVENTARIO"].map((t) => <option key={t}>{t}</option>)}</select>
        <button className="btn-3d btn-3d-dark text-sm px-3 py-1">Filtra</button>
      </form>
      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50"><th className="p-2">Data</th><th>Articolo</th><th>Causale</th><th className="text-right">Quantità</th><th>Collegato a</th><th>Note</th><th>Da</th></tr></thead>
          <tbody>
            {movimenti.map((m) => {
              const a = articoli.find((x) => x.id === m.articoloId), c = commMov.find((x) => x.id === m.commessaId), b = bolle.find((x) => x.id === m.bollaId);
              return (
                <tr key={m.id} className="border-b border-neutral-100">
                  <td className="p-2 whitespace-nowrap">{m.data.toLocaleDateString("it-IT")}</td>
                  <td>{a ? <><b className="text-xs">{a.codice}</b> {a.descrizione}</> : "—"}</td>
                  <td className="text-xs">{CAUSALI_MOVIMENTO[m.causale] ?? m.causale}</td>
                  <td className={`text-right font-semibold ${m.quantita < 0 ? "text-red-700" : "text-green-800"}`}>{m.quantita > 0 ? "+" : ""}{q(m.quantita)} {a?.um ?? ""}</td>
                  <td className="text-xs">{b ? <Link href={`/magazzino/bolle/${b.id}`} className="underline">bolla {b.numero}/{b.anno}</Link> : null}{c ? <Link href={`/commesse/${c.id}`} className="underline block">{numeroCommessa(c)} {c.cliente.nome}</Link> : null}</td>
                  <td className="text-xs">{m.note ?? ""}</td>
                  <td className="text-xs text-neutral-500">{m.creatoDaNome ?? ""}</td>
                </tr>
              );
            })}
            {movimenti.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-neutral-500">Nessun movimento.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
