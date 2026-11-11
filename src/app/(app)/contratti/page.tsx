export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { perInput } from "@/lib/calendario/tempo";
import { contrattiDi, personeVisibili, gestisceProvvigioni } from "@/lib/provvigioni/server";
import {
  filtra, totali, riepilogoPagamenti, riepilogoProvvigione, provvigioneSulleRate, NOMI_STATO_PAGAMENTO, NOMI_STATO_PROVVIGIONE,
  type Contratto, type StatoPagamento, type StatoProvvigione,
} from "@/lib/provvigioni/calcoli";
import { salvaProvvigione, eliminaProvvigione, registraLiquidazione, annullaLiquidazione, salvaPercentualeAbituale } from "@/app/provvigioni-actions";
import BottoneConferma from "@/components/BottoneConferma";
import { baseProvvigione } from "@/lib/provvigioni/servizi";
import RiquadroObiettivi from "@/components/provvigioni/RiquadroObiettivi";

type P = { persona?: string; q?: string; anno?: string; pagamento?: string; provvigione?: string; origine?: string; n?: string; aperto?: string; ok?: string; errore?: string };

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const giorno = (d: Date | null | undefined) => (d ? d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const ancora = (chiave: string) => `c-${chiave.replace(/[^A-Za-z0-9_-]/g, "_")}`;

const COLORE_PAGAMENTO: Record<StatoPagamento, string> = {
  PAGATO: "bg-green-100 text-green-800", PARZIALE: "bg-amber-100 text-amber-900", DA_INCASSARE: "bg-red-50 text-red-700", SENZA_IMPORTI: "bg-neutral-100 text-neutral-500",
};
const COLORE_PROVVIGIONE: Record<StatoProvvigione, string> = {
  DA_CONTROLLARE: "bg-neutral-100 text-neutral-600", IN_MATURAZIONE: "bg-blue-50 text-blue-800", DA_LIQUIDARE: "bg-violet-100 text-violet-800", LIQUIDATA: "bg-green-100 text-green-800",
};

export default async function ContrattiPage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const p = await searchParams;
  const gestore = gestisceProvvigioni(u);
  const persone = await personeVisibili(u);
  const persona = p.persona === "tutti" && persone.length > 1 ? "tutti"
    : persone.find((x) => x.id === p.persona)?.id ?? (gestore && persone.length > 1 ? "tutti" : u.id);
  const scelte = persona === "tutti" ? persone : persone.filter((x) => x.id === persona);
  const [tuttiContratti, abituali] = await Promise.all([
    contrattiDi(scelte.length ? scelte : [{ id: u.id, nome: u.nome, username: u.username }]),
    prisma.utente.findMany({ where: { id: { in: scelte.map((x) => x.id) } }, select: { id: true, nome: true, provvigionePercentuale: true } }),
  ]);
  const percentualeDi = new Map(abituali.map((x) => [x.id, x.provvigionePercentuale]));
  const filtri = { q: p.q?.trim(), anno: p.anno, pagamento: p.pagamento, provvigione: p.provvigione, origine: p.origine };
  const contratti = filtra(tuttiContratti, filtri);
  const t = totali(contratti);
  const limite = Math.max(30, Number(p.n) || 60);
  const anni = [...new Set(tuttiContratti.map((c) => c.data?.getFullYear()).filter(Boolean))].sort((a, b) => b! - a!);
  const nomePersona = persona === "tutti" ? "tutto il team" : persone.find((x) => x.id === persona)?.nome ?? u.nome;
  const qs = (extra: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ persona, q: p.q, anno: p.anno, pagamento: p.pagamento, provvigione: p.provvigione, origine: p.origine, n: p.n, ...extra })) if (v) s.set(k, v);
    return `/contratti?${s}`;
  };
  const campo = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";

  // riepilogo per commerciale (fatturazione, vista "tutto il team")
  const perCommerciale = persona === "tutti" ? scelte.map((x) => {
    const suoi = contratti.filter((c) => c.commercialeId === x.id);
    return { ...x, ...totali(suoi) };
  }).filter((x) => x.contratti > 0) : [];

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h1 className="text-2xl font-extrabold text-neutral-900">💼 Contratti e provvigioni</h1>
        <p className="text-sm text-neutral-600">
          {persona === u.id ? "I tuoi contratti" : `Contratti di ${nomePersona}`}: quanto ha pagato il cliente e le provvigioni.
          {gestore ? " Apri un contratto per inserire la percentuale (controllo del contratto) e registrare i pagamenti al commerciale." : " Le percentuali le inserisce l'ufficio fatturazione quando controlla il contratto."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={qs({ n: undefined }).replace("/contratti?", "/contratti/stampa?")} className="btn-3d btn-3d-outline px-3 py-1.5 text-sm">🖨️ Stampa</Link>
        {gestore && <Link href="/contratti/obiettivi" className="btn-3d btn-3d-amber px-3 py-1.5 text-sm">🎯 Obiettivi e premi</Link>}
      </div>
      </div>
      {persona !== "tutti" && <RiquadroObiettivi utenteId={persona} contratti={tuttiContratti} />}
      {p.ok && <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">✅ {p.ok}</p>}
      {p.errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{p.errore}</p>}

      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 bg-white p-3">
        {persone.length > 1 && (
          <label className="text-xs font-semibold text-neutral-600">Commerciale
            <select name="persona" defaultValue={persona} className={`${campo} block`}>
              <option value="tutti">Tutto il team</option>
              {persone.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </label>
        )}
        <label className="min-w-[220px] flex-1 text-xs font-semibold text-neutral-600">🔎 Cerca
          <input name="q" defaultValue={p.q ?? ""} placeholder="cliente, comune, n. contratto o fattura, prodotto…" className={`${campo} block w-full`} />
        </label>
        <label className="text-xs font-semibold text-neutral-600">Anno
          <select name="anno" defaultValue={p.anno ?? ""} className={`${campo} block`}>
            <option value="">Tutti</option>
            {anni.map((a) => <option key={a} value={String(a)}>{a}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-neutral-600">Pagamenti del cliente
          <select name="pagamento" defaultValue={p.pagamento ?? ""} className={`${campo} block`}>
            <option value="">Tutti</option>
            {(["DA_INCASSARE", "PARZIALE", "PAGATO"] as StatoPagamento[]).map((s) => <option key={s} value={s}>{NOMI_STATO_PAGAMENTO[s]}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-neutral-600">Provvigione
          <select name="provvigione" defaultValue={p.provvigione ?? ""} className={`${campo} block`}>
            <option value="">Tutte</option>
            {(Object.keys(NOMI_STATO_PROVVIGIONE) as StatoProvvigione[]).map((s) => <option key={s} value={s}>{NOMI_STATO_PROVVIGIONE[s]}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-neutral-600">Da
          <select name="origine" defaultValue={p.origine ?? ""} className={`${campo} block`}>
            <option value="">CRM e BConsole</option>
            <option value="CRM">Commesse del CRM</option>
            <option value="BCONSOLE">Storico BConsole</option>
          </select>
        </label>
        <button className="btn-3d btn-3d-dark px-4 py-1.5 text-sm">Cerca</button>
        <Link href={`/contratti?persona=${persona}`} className="text-xs text-blue-800 underline">azzera</Link>
      </form>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 [&>*]:min-w-0">
        {[
          ["Contratti", String(t.contratti), "trovati con questi filtri"],
          ["Venduto", eur(t.venduto), "imponibile dei contratti"],
          ["Pagato dai clienti", eur(t.incassato), "incassato finora"],
          ["Da incassare", eur(t.daIncassare), "ancora da pagare dai clienti"],
          ["Provvigioni", eur(t.provvigioni), t.daControllare ? `${t.daControllare} contratti da controllare` : "tutti controllati"],
          ["Maturate", eur(t.maturate), "sulla parte già pagata dal cliente"],
          ["Liquidate", eur(t.liquidate), "già pagate al commerciale"],
          ["Da liquidare", eur(t.daLiquidare), "maturate e non ancora pagate"],
        ].map(([titolo, valore, nota]) => (
          <div key={titolo} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
            <p className="text-xs text-neutral-600">{titolo}</p>
            <p className="truncate text-lg font-extrabold text-neutral-900">{valore}</p>
            <p className="truncate text-[11px] text-neutral-500">{nota}</p>
          </div>
        ))}
      </div>

      {gestore && persona !== "tutti" && (
        <form action={salvaPercentualeAbituale} className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm">
          <input type="hidden" name="utenteId" value={persona} />
          <input type="hidden" name="torna" value={qs({})} />
          <span>Provvigione abituale di <b>{nomePersona}</b>:</span>
          <input name="percentuale" type="number" step="0.01" min="0" max="100" defaultValue={percentualeDi.get(persona) ?? ""} className={`${campo} w-24`} aria-label="Percentuale abituale" />
          <span>%</span>
          <button className="btn-3d btn-3d-purple px-3 py-1 text-xs">Salva</button>
          <span className="text-xs text-neutral-600">proposta in automatico quando controlli un suo contratto</span>
        </form>
      )}

      {perCommerciale.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-600">
              <tr><th className="px-3 py-2">Commerciale</th><th className="px-3 py-2 text-right">Contratti</th><th className="px-3 py-2 text-right">Venduto</th><th className="px-3 py-2 text-right">Da incassare</th><th className="px-3 py-2 text-right">Da controllare</th><th className="px-3 py-2 text-right">Da liquidare</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {perCommerciale.map((x) => (
                <tr key={x.id}>
                  <td className="px-3 py-1.5"><Link href={qs({ persona: x.id, n: undefined })} className="font-semibold text-blue-800 underline">{x.nome}</Link></td>
                  <td className="px-3 py-1.5 text-right">{x.contratti}</td>
                  <td className="px-3 py-1.5 text-right">{eur(x.venduto)}</td>
                  <td className="px-3 py-1.5 text-right">{eur(x.daIncassare)}</td>
                  <td className="px-3 py-1.5 text-right">{x.daControllare || "—"}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{x.daLiquidare ? eur(x.daLiquidare) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
        {contratti.length === 0 && <p className="px-4 py-6 text-center text-sm text-neutral-500">Nessun contratto con questi filtri.</p>}
        {contratti.slice(0, limite).map((c) => (
          <RigaContratto key={c.chiave} c={c} gestore={gestore} conCommerciale={persona === "tutti"} aperto={p.aperto === c.chiave}
            torna={`${qs({ aperto: c.chiave })}#${ancora(c.chiave)}`} percentualeAbituale={c.commercialeId ? percentualeDi.get(c.commercialeId) ?? null : null} />
        ))}
      </div>
      {contratti.length > limite && (
        <p className="text-center"><Link href={qs({ n: String(limite + 100) })} className="btn-3d btn-3d-outline px-4 py-1.5 text-sm">Mostra altri ({contratti.length - limite})</Link></p>
      )}
    </div>
  );
}

function RigaContratto({ c, gestore, conCommerciale, aperto, torna, percentualeAbituale }: {
  c: Contratto; gestore: boolean; conCommerciale: boolean; aperto: boolean; torna: string; percentualeAbituale: number | null;
}) {
  const pg = riepilogoPagamenti(c);
  const pv = riepilogoProvvigione(c);
  const sulleRate = provvigioneSulleRate(c);
  const campo = "rounded-md border border-neutral-300 px-2 py-1 text-sm";
  return (
    <details id={ancora(c.chiave)} open={aperto} className="group">
      <summary className="grid cursor-pointer list-none gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-neutral-50 md:grid-cols-[110px_minmax(0,1fr)_110px_170px_160px] md:items-center">
        <span className="text-xs text-neutral-600">
          <span className="mr-1 text-neutral-400 transition-transform group-open:rotate-90 inline-block">▶</span>
          {giorno(c.data)}<br />
          <b className="text-neutral-900">{c.numero}</b>
          <span className={`ml-1 rounded px-1 text-[10px] ${c.origine === "CRM" ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600"}`}>{c.origine === "CRM" ? "CRM" : "BConsole"}</span>
        </span>
        <span className="min-w-0 text-sm">
          <b className="text-neutral-900">{c.clienteNome}</b>{c.comune ? <span className="text-neutral-500"> · {c.comune}</span> : null}
          <span className="block truncate text-xs text-neutral-600">{[c.marchio, c.descrizione].filter(Boolean).join(" · ") || "—"}{conCommerciale && c.commercialeNome ? ` · 👤 ${c.commercialeNome}` : ""}</span>
        </span>
        <span className="text-sm font-semibold text-neutral-900 md:text-right">{eur(c.imponibile)}<span className="block text-[11px] font-normal text-neutral-500">imponibile</span></span>
        <span className="text-xs">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${COLORE_PAGAMENTO[pg.stato]}`}>{NOMI_STATO_PAGAMENTO[pg.stato]}</span>
          <span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-neutral-100" aria-hidden><span className="block h-full bg-green-600" style={{ width: `${Math.round(pg.quota * 100)}%` }} /></span>
          <span className="text-neutral-600">{eur(pg.incassato)} di {eur(pg.dovuto)}</span>
        </span>
        <span className="text-xs md:text-right">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${COLORE_PROVVIGIONE[pv.stato]}`}>{NOMI_STATO_PROVVIGIONE[pv.stato]}</span>
          {c.provvigione && <span className="block text-neutral-700">{c.provvigione.percentuale}% = <b>{eur(pv.importo)}</b></span>}
        </span>
      </summary>

      <div className="grid gap-4 bg-neutral-50/70 px-4 pb-4 pt-2 lg:grid-cols-2 [&>*]:min-w-0">
        <div>
          <h3 className="mb-1 text-sm font-bold text-neutral-900">💶 Pagamenti del cliente</h3>
          {c.pagamenti.length === 0 ? <p className="text-xs text-neutral-500">Nessuna rata registrata.</p> : (
            <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 text-left text-neutral-600"><tr><th className="px-2 py-1">Rata</th><th className="px-2 py-1">Scadenza</th><th className="px-2 py-1 text-right">Importo</th><th className="px-2 py-1 text-right">Pagato</th><th className="px-2 py-1 text-right">Resta</th>{c.provvigione && <th className="px-2 py-1 text-right" title="Parte della provvigione legata a questa rata: matura quando il cliente la paga">Provv.</th>}</tr></thead>
                <tbody className="divide-y divide-neutral-100">
                  {c.pagamenti.map((r) => (
                    <tr key={r.id} className={r.stato === "ANNULLATA" || r.stato === "SOSTITUITA" ? "text-neutral-400 line-through" : ""}>
                      <td className="px-2 py-1">{r.descrizione}{r.documento ? ` (${r.documento})` : ""}{r.ultimoIncasso ? <span className="block text-[10px] text-green-700">pagato il {giorno(r.ultimoIncasso)}</span> : null}</td>
                      <td className="px-2 py-1">{giorno(r.scadenza)}</td>
                      <td className="px-2 py-1 text-right">{eur(r.importo)}</td>
                      <td className="px-2 py-1 text-right text-green-800">{r.incassato ? eur(r.incassato) : "—"}</td>
                      <td className={`px-2 py-1 text-right ${r.residuo > 0.5 ? "font-semibold text-red-700" : ""}`}>{r.residuo > 0.5 ? eur(r.residuo) : "✓"}</td>
                      {c.provvigione && <td className="px-2 py-1 text-right text-violet-800">{sulleRate.get(r.id) ? <>{eur(sulleRate.get(r.id)!.quota)}<span className="block text-[10px] text-neutral-500">{sulleRate.get(r.id)!.maturata >= sulleRate.get(r.id)!.quota - 0.005 ? "maturata" : sulleRate.get(r.id)!.maturata > 0 ? `maturati ${eur(sulleRate.get(r.id)!.maturata)}` : "da maturare"}</span></> : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-1 text-xs text-neutral-600">
            {c.fatture.length ? `Fatture: ${c.fatture.join(", ")}` : "Nessuna fattura collegata"}
            {c.href && <> · <Link href={c.href} className="text-blue-800 underline">apri la commessa</Link></>}
            {c.stato ? ` · stato: ${c.stato.replace(/_/g, " ").toLowerCase()}` : ""}
          </p>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-bold text-neutral-900">🤝 Provvigione{conCommerciale && c.commercialeNome ? ` di ${c.commercialeNome}` : ""}</h3>
          {c.provvigione ? (
            <div className="rounded-md border border-neutral-200 bg-white p-2 text-xs">
              <p>{c.provvigione.percentuale}% di {eur(c.provvigione.base)} = <b className="text-sm">{eur(pv.importo)}</b></p>
              <p className="text-neutral-600">Maturata {eur(pv.maturata)} · liquidata {eur(pv.liquidata)} · <b className="text-violet-800">da liquidare {eur(pv.daLiquidare)}</b>{pv.futura > 0 ? ` · matura ancora ${eur(pv.futura)} quando il cliente paga il resto` : ""}</p>
              <p className="text-neutral-500">Controllata da {c.provvigione.controllataDa ?? "—"} il {giorno(c.provvigione.controllataIl)}{c.provvigione.note ? ` · ${c.provvigione.note}` : ""}</p>
              {c.provvigione.liquidazioni.length > 0 && (
                <ul className="mt-1 divide-y divide-neutral-100 border-t border-neutral-100">
                  {c.provvigione.liquidazioni.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-2 py-1">
                      <span>✓ pagati {eur(l.importo)} il {giorno(l.data)}{l.note ? ` · ${l.note}` : ""}{l.registrataDa ? <span className="text-neutral-400"> ({l.registrataDa})</span> : null}</span>
                      {gestore && (
                        <form action={annullaLiquidazione}>
                          <input type="hidden" name="id" value={l.id} /><input type="hidden" name="torna" value={torna} />
                          <BottoneConferma messaggio="Annullare questo pagamento al commerciale?" className="text-[11px] text-red-700 underline">annulla</BottoneConferma>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-neutral-300 bg-white p-2 text-xs text-neutral-600">
              {gestore ? "Contratto da controllare: inserisci la percentuale qui sotto." : "L'ufficio fatturazione non ha ancora controllato questo contratto: la provvigione comparirà qui."}
            </p>
          )}

          {(c.servizi ?? 0) > 0 && (
            <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
              🧾 Servizi e pratiche fuori provvigione: {eur(c.servizi!)} · base proposta {eur(c.imponibile)} − {eur(c.servizi!)} = <b>{eur(baseProvvigione(c.imponibile, c.servizi!))}</b>
            </p>
          )}
          {gestore && c.commercialeId && (
            <div className="mt-2 grid gap-2">
              <form action={salvaProvvigione} className="flex flex-wrap items-end gap-2 rounded-md border border-violet-200 bg-violet-50 p-2 text-xs">
                <input type="hidden" name="contratto" value={c.chiave} /><input type="hidden" name="utenteId" value={c.commercialeId} />
                <input type="hidden" name="clienteNome" value={c.clienteNome} /><input type="hidden" name="descrizione" value={c.descrizione ?? ""} />
                <input type="hidden" name="torna" value={torna} />
                <label className="font-semibold">Imponibile €<input name="base" type="number" step="0.01" min="0" defaultValue={c.provvigione?.base ?? baseProvvigione(c.imponibile, c.servizi ?? 0)} className={`${campo} block w-28`} /></label>
                <label className="font-semibold">%<input name="percentuale" type="number" step="0.01" min="0" max="100" defaultValue={c.provvigione?.percentuale ?? percentualeAbituale ?? ""} required className={`${campo} block w-20`} /></label>
                <label className="min-w-[120px] flex-1 font-semibold">Nota<input name="note" defaultValue={c.provvigione?.note ?? ""} placeholder="es. contratto controllato, sconto extra…" className={`${campo} block w-full`} /></label>
                <button className="btn-3d btn-3d-purple px-3 py-1 text-xs">{c.provvigione ? "Correggi" : "✓ Contratto controllato"}</button>
              </form>
              {c.provvigione && pv.liquidata < pv.importo - 0.005 && (
                <form action={registraLiquidazione} className="flex flex-wrap items-end gap-2 rounded-md border border-green-200 bg-green-50 p-2 text-xs">
                  <input type="hidden" name="provvigioneId" value={c.provvigione.id} /><input type="hidden" name="torna" value={torna} />
                  <label className="font-semibold">Pagato al commerciale €<input name="importo" type="number" step="0.01" min="0.01" defaultValue={pv.daLiquidare || ""} className={`${campo} block w-28`} /></label>
                  <label className="font-semibold">Il<input name="data" type="date" defaultValue={perInput(new Date()).slice(0, 10)} className={`${campo} block`} /></label>
                  <label className="min-w-[120px] flex-1 font-semibold">Nota<input name="note" placeholder="es. busta paga di novembre" className={`${campo} block w-full`} /></label>
                  <button className="btn-3d btn-3d-green px-3 py-1 text-xs">💶 Registra pagamento</button>
                </form>
              )}
              {c.provvigione && c.provvigione.liquidazioni.length === 0 && (
                <form action={eliminaProvvigione}>
                  <input type="hidden" name="id" value={c.provvigione.id} /><input type="hidden" name="torna" value={torna} />
                  <BottoneConferma messaggio="Togliere la provvigione? Il contratto tornerà «da controllare»." className="text-[11px] text-red-700 underline">togli provvigione</BottoneConferma>
                </form>
              )}
            </div>
          )}
          {gestore && !c.commercialeId && <p className="mt-2 text-xs text-amber-800">Il venditore di BConsole non corrisponde a nessun utente del CRM: la provvigione non si può assegnare.</p>}
        </div>
      </div>
    </details>
  );
}
