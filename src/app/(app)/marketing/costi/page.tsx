export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoMarketing } from "@/lib/utenti/stato";
import { provenienzaDaFonte, PROVENIENZE } from "@/lib/clienti/provenienza";
import { costiPerCanale, limitiMese, meseValido } from "@/lib/marketing/costi";
import { salvaSpeseMarketing } from "@/app/spese-marketing-actions";

const eur = (n: number | null) => (n === null ? "—" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: n >= 100 ? 0 : 2 }));
const meseNome = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "Europe/Rome" });
const meseAttuale = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }).slice(0, 7);

/** Costo per canale: per i lead arrivati nel mese, quanti sono diventati appuntamenti e contratti, e quanto è costato ognuno. */
export default async function CostoPerCanalePage({ searchParams }: { searchParams: Promise<{ mese?: string; salvato?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u || !puoMarketing(u)) notFound();
  const p = await searchParams;
  const mese = meseValido(p.mese) ? p.mese! : meseAttuale();
  const { dal, al } = limitiMese(mese);
  const [lead, spese] = await Promise.all([
    prisma.lead.findMany({
      where: { createdAt: { gte: dal, lt: al } },
      select: { fonte: true, fase: true, appuntamentoIl: true, clienteGenerato: { select: { commesse: { where: { stato: { not: "ANNULLATA" } }, select: { totaleImponibile: true } }, preventivi: { where: { confermatoIl: { not: null } }, select: { id: true } } } } },
    }),
    prisma.spesaMarketing.findMany({ where: { mese } }),
  ]);
  const righe = costiPerCanale(
    lead.map((l) => {
      const comm = l.clienteGenerato?.commesse ?? [];
      return { canale: provenienzaDaFonte(l.fonte), fase: l.fase, appuntamentoIl: l.appuntamentoIl, contratto: comm.length > 0 || (l.clienteGenerato?.preventivi.length ?? 0) > 0, fatturato: comm.reduce((t, c) => t + c.totaleImponibile, 0) };
    }),
    Object.fromEntries(spese.map((s) => [s.canale, s.importo])),
  );
  const tot = righe.reduce((t, r) => ({ lead: t.lead + r.lead, app: t.app + r.appuntamenti, con: t.con + r.contratti, fat: t.fat + r.fatturato, spesa: t.spesa + r.spesa }), { lead: 0, app: 0, con: 0, fat: 0, spesa: 0 });
  const canaliSpesa = [...new Set(["FACEBOOK", "INSTAGRAM", "GOOGLE", ...righe.map((r) => r.canale), ...spese.map((s) => s.canale)])];
  const precedente = (() => { const d = new Date(`${mese}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const successivo = (() => { const d = new Date(`${mese}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <Link href="/marketing" className="btn-indietro">← Marketing</Link>
        <h1 className="text-2xl font-extrabold text-neutral-900">💶 Costo per canale</h1>
        <p className="text-sm text-neutral-600">Per i lead arrivati nel mese: quanti sono diventati appuntamenti e contratti, e quanto è costato ognuno. Conta il <b>costo per contratto</b>, non quello per lead: un lead a 5 € che non firma mai costa più di uno a 30 € che firma.</p>
      </div>
      {p.salvato && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✓ Spese salvate</p>}
      {p.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{p.errore}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/marketing/costi?mese=${precedente}`} className="btn-3d btn-3d-outline text-sm px-3 py-1.5">‹ {meseNome(precedente)}</Link>
        <span className="text-lg font-bold capitalize px-2">{meseNome(mese)}</span>
        <Link href={`/marketing/costi?mese=${successivo}`} className="btn-3d btn-3d-outline text-sm px-3 py-1.5">{meseNome(successivo)} ›</Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[["Lead", String(tot.lead)], ["Appuntamenti", String(tot.app)], ["Contratti", String(tot.con)], ["Spesa", eur(tot.spesa)], ["Costo per contratto", tot.con && tot.spesa ? eur(tot.spesa / tot.con) : "—"]].map(([t, v]) => (
          <div key={t} className="rounded-xl border border-neutral-200 bg-white p-3"><div className="text-[11px] font-bold uppercase text-neutral-500">{t}</div><div className="text-2xl font-extrabold tabular-nums">{v}</div></div>
        ))}
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200 bg-neutral-50">
            <th className="p-2">Canale</th><th className="text-right">Lead</th><th className="text-right">Appuntamenti</th><th className="text-right">Contratti</th><th className="text-right">Venduto (imponibile)</th>
            <th className="text-right">Spesa</th><th className="text-right">€ per lead</th><th className="text-right">€ per appuntamento</th><th className="text-right p-2">€ per contratto</th>
          </tr></thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.canale} className="border-b border-neutral-100">
                <td className="p-2 font-semibold">{r.canale}</td>
                <td className="text-right tabular-nums">{r.lead}</td>
                <td className="text-right tabular-nums">{r.appuntamenti}<span className="text-[11px] text-neutral-500">{r.lead ? ` (${Math.round((r.appuntamenti / r.lead) * 100)}%)` : ""}</span></td>
                <td className="text-right tabular-nums">{r.contratti}<span className="text-[11px] text-neutral-500">{r.appuntamenti ? ` (${Math.round((r.contratti / r.appuntamenti) * 100)}%)` : ""}</span></td>
                <td className="text-right tabular-nums">{eur(r.fatturato)}</td>
                <td className="text-right tabular-nums">{r.spesa ? eur(r.spesa) : <span className="text-neutral-400">0</span>}</td>
                <td className="text-right tabular-nums">{eur(r.costoLead)}</td>
                <td className="text-right tabular-nums">{eur(r.costoAppuntamento)}</td>
                <td className="text-right tabular-nums p-2 font-bold">{r.spesa && !r.contratti ? <span className="text-red-700">nessun contratto</span> : eur(r.costoContratto)}</td>
              </tr>
            ))}
            {righe.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-neutral-500">Nessun lead in questo mese.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-600">Appuntamento = il lead ha avuto una visita o una chiamata fissata con il commerciale. Contratto = il cliente nato dal lead ha una commessa o un&apos;offerta confermata (contano anche quelli firmati nei mesi dopo). «CAMPAGNA» sono i contatti diventati chiamate cliccando un&apos;email.</p>

      <form action={salvaSpeseMarketing} className="card-fase space-y-3">
        <input type="hidden" name="mese" value={mese} />
        <h2 className="font-bold text-neutral-900">Quanto abbiamo speso a {meseNome(mese)}</h2>
        <p className="text-xs text-neutral-600">Scrivi la spesa di ogni canale (es. dal Gestione inserzioni di Meta). 0 o vuoto = nessuna spesa. Le email ai clienti non costano niente: lasciale a 0.</p>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {canaliSpesa.map((k) => (
            <label key={k} className="text-xs text-neutral-700">{k}
              <input name={`spesa_${k}`} defaultValue={spese.find((s) => s.canale === k)?.importo ?? ""} placeholder="0" inputMode="decimal" className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-full" />
            </label>
          ))}
          <label className="text-xs text-neutral-700">Altro canale
            <div className="flex gap-1">
              <input name="nuovo_canale" list="canali" placeholder="es. QUOTALO" className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-full" />
              <input name="nuovo_importo" placeholder="€" inputMode="decimal" className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-20" />
            </div>
            <datalist id="canali">{PROVENIENZE.map((x) => <option key={x} value={x} />)}</datalist>
          </label>
        </div>
        <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Salva le spese</button>
      </form>
    </div>
  );
}
