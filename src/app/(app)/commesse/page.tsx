export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import BrandSwitcher from "@/components/BrandSwitcher";
import { getCurrentUser } from "@/lib/auth";
import { scopePreventivoWhere } from "@/lib/scope";
import { creaCommessaDaPreventivo } from "@/app/commesse-actions";
import { STATI_COMMESSA, numeroCommessa, eur } from "@/lib/commesse";

export default async function CommessePage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const { brand } = await searchParams;
  const brandFiltro = brand && brand !== "Tutti" ? { brand: { nome: brand } } : {};
  const utente = await getCurrentUser();
  const scope = utente ? scopePreventivoWhere(utente) : {};

  const [commesse, daAvviare, rilievi] = await Promise.all([
    prisma.commessa.findMany({
      where: { ...brandFiltro, preventivo: scope },
      include: { cliente: true, brand: true, rilievi: { where: { stato: "PROGRAMMATO" }, orderBy: { dataOra: "asc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.preventivo.findMany({
      where: { ...brandFiltro, ...scope, stato: "ACCETTATO", commessa: null },
      include: { cliente: true, brand: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.rilievo.findMany({
      where: { stato: "PROGRAMMATO", commessa: { ...brandFiltro, preventivo: scope } },
      include: { commessa: { include: { cliente: true } }, tecnico: true },
      orderBy: { dataOra: "asc" },
      take: 15,
    }),
  ]);

  const colonne = ["IN_ATTESA_ACCONTO", "RILIEVO_DA_PROGRAMMARE", "RILIEVO_PROGRAMMATO", "RILIEVO_ESEGUITO", "POSA", "LAVORI_ESEGUITI"];

  return (
    <div className="max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Commesse</h1>
        <BrandSwitcher active={brand ?? "Tutti"} />
      </div>

      {daAvviare.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6">
          <p className="text-sm font-bold text-amber-900 mb-2">Preventivi accettati senza commessa ({daAvviare.length})</p>
          <div className="space-y-1.5">
            {daAvviare.map((p) => (
              <form key={p.id} action={creaCommessaDaPreventivo} className="flex items-center justify-between gap-2 bg-white rounded border border-amber-200 px-3 py-1.5">
                <input type="hidden" name="preventivoId" value={p.id} />
                <span className="text-sm text-neutral-900">
                  <b>{p.cliente.nome}</b> · {p.brand.nome}
                  {p.numeroOfferta ? ` · offerta n° ${p.numeroOfferta}` : ""} · {eur(p.totaleNetto + p.totaleIva)}
                </span>
                <button className="btn-3d btn-3d-green text-xs px-3 py-1">Crea commessa</button>
              </form>
            ))}
          </div>
        </div>
      )}

      {rilievi.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
          <p className="text-sm font-bold text-neutral-900 mb-2">Calendario rilievi programmati</p>
          <div className="divide-y divide-neutral-100">
            {rilievi.map((r) => (
              <Link key={r.id} href={`/commesse/${r.commessaId}`} className="flex items-center justify-between py-1.5 text-sm hover:bg-neutral-50">
                <span className="font-medium text-neutral-900">{r.dataOra.toLocaleString("it-IT", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-neutral-800">{r.commessa.cliente.nome}</span>
                <span className="text-neutral-600">{r.tecnico.nome}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-6 gap-2 items-start">
        {colonne.map((st) => {
          const lista = commesse.filter((c) => c.stato === st);
          return (
            <div key={st} className="bg-neutral-50 rounded-lg border border-neutral-200 p-2">
              <p className={`text-xs font-bold px-2 py-1 rounded mb-2 ${STATI_COMMESSA[st].cls}`}>
                {STATI_COMMESSA[st].label} ({lista.length})
              </p>
              <div className="space-y-2">
                {lista.map((c) => (
                  <Link key={c.id} href={`/commesse/${c.id}`} className="block bg-white rounded border border-neutral-200 p-2.5 hover:border-neutral-400">
                    <p className="text-[11px] text-neutral-500">{numeroCommessa(c)} · {c.brand.nome}</p>
                    <p className="text-sm font-semibold text-neutral-900">{c.cliente.nome}</p>
                    <p className="text-xs text-neutral-700">{eur(c.totaleVendita)}</p>
                    {c.rilievi[0] && (
                      <p className="text-[11px] text-indigo-800 mt-1">📅 {c.rilievi[0].dataOra.toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
