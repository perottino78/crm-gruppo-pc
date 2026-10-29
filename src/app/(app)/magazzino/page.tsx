export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { situazioneMagazzino } from "@/lib/magazzino/server";
import { giorniRitardo, numeroBolla, statoBolla } from "@/lib/magazzino/calcoli";
import { numeroCommessa } from "@/lib/commesse";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });
const dataIt = (d?: Date | null) => (d ? d.toLocaleDateString("it-IT") : "—");

export default async function MagazzinoPage() {
  const [attese, bolleAperte, daFatturare, pronte, scorte, ultime] = await Promise.all([
    prisma.rigaOrdine.findMany({ where: { arrivato: false, ordineFornitore: { stato: { in: ["INVIATO", "CONFERMATO", "EVASO_PARZIALE"] } } }, select: { ordineFornitore: { select: { consegnaConfermata: true, consegnaRichiesta: true } } } }),
    prisma.bollaEntrata.count({ where: { stato: "APERTA" } }),
    prisma.bollaEntrata.count({ where: { stato: "DA_FATTURARE" } }),
    prisma.commessa.findMany({ where: { materialeCompletoIl: { not: null }, stato: { notIn: ["CHIUSA", "ANNULLATA", "LAVORI_ESEGUITI"] } }, include: { cliente: { select: { nome: true } } }, orderBy: { materialeCompletoIl: "desc" }, take: 30 }),
    situazioneMagazzino(),
    prisma.bollaEntrata.findMany({ orderBy: [{ anno: "desc" }, { numero: "desc" }], take: 8 }),
  ]);
  const inRitardo = attese.filter((r) => { const g = giorniRitardo(r.ordineFornitore?.consegnaConfermata ?? r.ordineFornitore?.consegnaRichiesta); return g !== null && g > 0; }).length;
  const sotto = scorte.filter((s) => s.sottoScorta);
  const valore = scorte.reduce((t, s) => t + (s.valore ?? 0), 0);
  const card = "rounded-lg border border-neutral-200 bg-white p-3";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Link href="/magazzino/consegne" className={card}><p className="text-xs text-neutral-500">Righe in arrivo</p><p className="text-2xl font-bold">{attese.length}</p>{inRitardo > 0 && <p className="text-xs text-red-700">{inRitardo} in ritardo</p>}</Link>
        <Link href="/magazzino/bolle?stato=APERTA" className={card}><p className="text-xs text-neutral-500">Bolle in spunta</p><p className="text-2xl font-bold">{bolleAperte}</p></Link>
        <Link href="/magazzino/bolle?stato=DA_FATTURARE" className={card}><p className="text-xs text-neutral-500">Bolle da fatturare</p><p className="text-2xl font-bold">{daFatturare}</p></Link>
        <Link href="/magazzino/commesse?vista=pronte" className={card}><p className="text-xs text-neutral-500">Commesse con materiale completo</p><p className="text-2xl font-bold text-green-800">{pronte.length}</p></Link>
        <Link href="/magazzino/giacenze" className={card}><p className="text-xs text-neutral-500">Valore magazzino</p><p className="text-2xl font-bold">{eur(valore)}</p>{sotto.length > 0 && <p className="text-xs text-amber-800">{sotto.length} articoli sotto scorta</p>}</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/magazzino/bolle?nuova=1" className="btn-3d btn-3d-green text-sm px-3 py-1.5">+ Registra una bolla in arrivo</Link>
        <Link href="/magazzino/giacenze?vista=sotto" className="btn-3d btn-3d-purple text-sm px-3 py-1.5">Riordina le scorte</Link>
        <Link href="/archivio" className="btn-3d btn-3d-dark text-sm px-3 py-1.5">📁 Archivio file</Link>
      </div>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h2 className="font-bold mb-2">✅ Materiale completo: pronte per saldo e posa</h2>
        {pronte.length === 0 ? <p className="text-sm text-neutral-500">Nessuna commessa con tutto il materiale arrivato.</p> : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {pronte.map((c) => (
              <li key={c.id} className="py-1.5 flex flex-wrap gap-2 items-center">
                <Link href={`/commesse/${c.id}#materiale`} className="text-blue-800 underline font-medium">{numeroCommessa(c)} · {c.cliente.nome}</Link>
                <span className="text-xs text-neutral-600">completo dal {dataIt(c.materialeCompletoIl)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${c.saldoIncassato ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{c.saldoIncassato ? "saldo incassato" : "saldo da incassare"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="font-bold mb-2">Ultime bolle</h2>
          {ultime.length === 0 ? <p className="text-sm text-neutral-500">Nessuna bolla registrata.</p> : (
            <ul className="text-sm divide-y divide-neutral-100">
              {ultime.map((b) => <li key={b.id} className="py-1 flex justify-between gap-2"><Link href={`/magazzino/bolle/${b.id}`} className="underline">{numeroBolla(b)} · {b.fornitoreNome}</Link><span className="text-xs" style={{ color: statoBolla(b.stato).colore }}>{statoBolla(b.stato).nome}</span></li>)}
            </ul>
          )}
        </section>
        <section className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="font-bold mb-2">Sotto scorta</h2>
          {sotto.length === 0 ? <p className="text-sm text-neutral-500">Nessun articolo sotto la scorta minima.</p> : (
            <ul className="text-sm divide-y divide-neutral-100">
              {sotto.slice(0, 12).map((s) => <li key={s.id} className="py-1 flex justify-between gap-2"><span>{s.codice} — {s.descrizione}</span><span className="text-xs text-amber-800">disp. {s.disponibile} / min {s.scortaMinima ?? 0} {s.um}</span></li>)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
