export const dynamic = "force-dynamic";

import Link from "next/link";
import { periodoDa } from "@/lib/amministrazione/analisi";
import { utenteAmministrazione } from "@/lib/amministrazione/server";
import { datiReport } from "@/lib/report/server";
import { primeEAltri, type Voce } from "@/lib/report/calcoli";
import { Barre, Colonne, Tabella, type VoceBarra } from "@/components/report/Grafici";
import { COLORI, eur0, perc1 } from "@/lib/report/formato";
import Simulatore from "@/components/report/Simulatore";

type P = { preset?: string; marchio?: string };
const MARCHI = ["P&C", "Solaris", "Purafonte"];
const PERIODI: [string, string][] = [["anno", "Anno in corso"], ["trimestre", "Trimestre"], ["mese", "Mese"], ["mese-scorso", "Mese scorso"], ["12mesi", "Ultimi 12 mesi"]];

function Sezione({ titolo, sotto, colore = "#2563eb", children }: { titolo: string; sotto?: string; colore?: string; children: React.ReactNode }) {
  return (
    <section className="card-fase" style={{ ["--fase" as string]: colore }}>
      <h2>{titolo}</h2>
      {sotto && <p className="mt-1 mb-3 text-xs text-neutral-600">{sotto}</p>}
      <div className={sotto ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Tessera({ titolo, valore, sotto, avviso }: { titolo: string; valore: string; sotto?: string; avviso?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,0.06)]">
      <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{titolo}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums text-neutral-900">{valore}</div>
      {sotto && <div className="text-xs text-neutral-600">{sotto}</div>}
      {avviso && <div className="mt-0.5 text-xs font-bold text-red-700">⚠ {avviso}</div>}
    </div>
  );
}

const barre = (v: Voce[], extra?: (x: Voce) => [string, string][]): VoceBarra[] =>
  v.map((x) => ({ etichetta: x.chiave, valore: x.valore, nota: perc1(x.quota).replace(",0%", "%"), dettagli: [["Quota sul totale", perc1(x.quota)], ["Documenti", String(x.n)], ...(extra?.(x) ?? [])] }));

export default async function ReportPage({ searchParams }: { searchParams: Promise<P> }) {
  if (!(await utenteAmministrazione())) {
    return <div className="max-w-xl"><h1 className="mb-3 text-2xl font-bold">Report</h1><p className="text-sm text-neutral-700">I report con fatturato, margini e banche sono visibili all&apos;amministrazione.</p></div>;
  }
  const p = await searchParams;
  const periodo = periodoDa({ preset: p.preset });
  const marchio = MARCHI.includes(p.marchio ?? "") ? p.marchio : undefined;
  const d = await datiReport(periodo, marchio);
  const k = d.kpi;
  const qs = (x: Partial<P>) => { const u = new URLSearchParams(); const o = { preset: p.preset, marchio, ...x }; Object.entries(o).forEach(([a, b]) => b && u.set(a, b)); const s = u.toString(); return s ? `?${s}` : "?"; };
  const pill = (a: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"}`;

  const valutabili = d.margini.filter((m) => m.valutabile);
  const piuGuadagno = [...valutabili].sort((a, b) => b.margine - a.margine).slice(0, 8);
  const menoRendimento = [...valutabili].sort((a, b) => (a.perc ?? 0) - (b.perc ?? 0)).slice(0, 8);
  const catMarg = d.marginiCategoria.filter((c) => c.ricavo >= 3000);
  const migliore = [...catMarg].sort((a, b) => (b.perc ?? 0) - (a.perc ?? 0))[0];
  const peggiore = [...catMarg].sort((a, b) => (a.perc ?? 0) - (b.perc ?? 0))[0];
  const minimoCassa = d.cassa.reduce((m, w) => (w.saldo < m.saldo ? w : m), d.cassa[0]);
  const top5Fornitori = d.fornitori.slice(0, 5).reduce((t, f) => t + f.quota, 0);
  const margVend = new Map(d.marginiVenditore.map((m) => [m.chiave, m]));
  const margCat = new Map(d.marginiCategoria.map((m) => [m.chiave, m]));
  const dataBreve = (x: Date) => x.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" });

  // in breve: le cose da sapere, scritte per esteso
  const inBreve = [
    d.perVenditore[0] && `${d.perVenditore[0].chiave} ha fatturato di più: ${eur0(d.perVenditore[0].valore)} (${perc1(d.perVenditore[0].quota)} del totale).`,
    d.perCategoria[0] && `Il prodotto più venduto è ${d.perCategoria[0].chiave}: ${eur0(d.perCategoria[0].valore)}.`,
    migliore && `Rende di più ${migliore.chiave}: margine ${perc1(migliore.perc)} sulle commesse con i costi completi.`,
    peggiore && peggiore !== migliore && `Rende di meno ${peggiore.chiave}: margine ${perc1(peggiore.perc)}. Da controllare prezzi, sconti e costi di posa.`,
    k.scaduto > 0 && `Crediti scaduti da incassare: ${eur0(k.scaduto)} su ${eur0(k.crediti)} (${perc1(k.crediti ? k.scaduto / k.crediti : 0)}).`,
    k.dso !== null && `In media i clienti pagano in ${k.dso} giorni dalla fattura.`,
    k.debitiScaduti > k.debiti * 0.3 && `Fatture fornitori scadute e non segnate come pagate: ${eur0(k.debitiScaduti)}. Se sono già pagate, registrale nello scadenzario (o rilancia l'import da BConsole), altrimenti la cassa prevista risulta più bassa del vero.`,
    d.banche[0] && `La banca che costa di più è ${d.banche[0].banca}: ${eur0(d.banche[0].totale)} nel periodo.`,
    minimoCassa && `Cassa prevista: il punto più basso delle prossime 13 settimane è ${eur0(minimoCassa.saldo)} (settimana del ${dataBreve(minimoCassa.inizio)}).`,
  ].filter(Boolean) as string[];

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-neutral-900">Report</h1>
        <p className="text-sm text-neutral-600">Cosa si vende, chi vende, quanto si guadagna, cassa e banche — {periodo.etichetta}{marchio ? ` · ${marchio}` : ""}. Dati dalle fatture (BConsole e CRM).</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODI.map(([v, l]) => <Link key={v} href={qs({ preset: v })} className={pill(periodo.preset === v)}>{l}</Link>)}
        <span className="mx-1 h-5 w-px bg-neutral-300" />
        <Link href={qs({ marchio: undefined })} className={pill(!marchio)}>Tutti i marchi</Link>
        {MARCHI.map((m) => <Link key={m} href={qs({ marchio: m })} className={pill(marchio === m)}>{m}</Link>)}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tessera titolo="Fatturato (imponibile)" valore={eur0(k.ricavi)} sotto={`${k.nFatture} fatture · ${k.clienti} clienti`} />
        <Tessera titolo="Acquisti (imponibile)" valore={eur0(k.costi)} sotto={k.ricavi ? `${perc1(k.costi / k.ricavi)} del fatturato` : undefined} />
        <Tessera titolo="Margine commesse" valore={perc1(k.margineCommesse)} sotto={`su ${k.commesseValutabili} commesse con costi completi (di ${k.commesse})`} />
        <Tessera titolo="Fattura media" valore={eur0(k.ticketMedio)} sotto="imponibile per fattura" />
        <Tessera titolo="Da incassare" valore={eur0(k.crediti)} sotto={`giorni medi di incasso: ${k.dso ?? "—"}`} avviso={k.scaduto > 0 ? `${eur0(k.scaduto)} già scaduti` : undefined} />
        <Tessera titolo="Da pagare" valore={eur0(k.debiti)} avviso={k.debitiScaduti > 0 ? `${eur0(k.debitiScaduti)} scaduti` : undefined} />
        <Tessera titolo="Saldo banche oggi" valore={d.saldi.length ? eur0(k.saldoOggi) : "—"} sotto={d.saldi.length ? `${d.saldi.length} conti` : "nessun conto in Amministrazione › Banche"} />
        <Tessera titolo="Vendite − acquisti" valore={eur0(k.ricavi - k.costi)} sotto="tutte le fatture d'acquisto: anche stipendi, pubblicità, Work & Services" />
      </div>

      {inBreve.length > 0 && (
        <Sezione titolo="💡 In breve" colore="#7c3aed">
          <ul className="grid gap-x-6 gap-y-1.5 text-sm text-neutral-800 md:grid-cols-2">{inBreve.map((t) => <li key={t} className="flex gap-2"><span className="text-neutral-400">•</span>{t}</li>)}</ul>
        </Sezione>
      )}

      <Sezione titolo="📈 Vendite e acquisti mese per mese" sotto="Imponibile delle fatture di vendita e d'acquisto. Passa col mouse su un mese per i numeri." colore="#2563eb">
        <Colonne etichette={d.mesi.map((m) => m.etichetta)} serie={[{ nome: "Vendite", colore: COLORI[0], valori: d.mesi.map((m) => m.vendite) }, { nome: "Acquisti", colore: COLORI[1], valori: d.mesi.map((m) => m.acquisti) }]} />
        <Tabella intestazioni={["Mese", "Vendite", "Acquisti", "Differenza"]} righe={d.mesi.map((m) => [m.etichetta, eur0(m.vendite), eur0(m.acquisti), eur0(m.vendite - m.acquisti)])} />
      </Sezione>

      <Sezione titolo="🏆 Chi vende" sotto="Fatturato per venditore (dalla sigla in BConsole) e margine delle sue commesse con i costi completi." colore="#ea580c">
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Fatturato</h3>
            <Barre voci={barre(primeEAltri(d.perVenditore, 10), (x) => { const m = margVend.get(x.chiave); return m ? [["Margine commesse", perc1(m.perc)], ["Commesse valutate", String(m.n)]] : []; })} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Margine delle commesse</h3>
            <div className="overflow-x-auto"><table className="w-full min-w-[30rem] text-xs">
              <thead className="text-neutral-500"><tr><th className="py-1 text-left">Venditore</th><th className="text-right">Ricavo</th><th className="text-right">Margine</th><th className="text-right">%</th><th className="text-right">Commesse</th></tr></thead>
              <tbody>
                {d.marginiVenditore.map((m) => (
                  <tr key={m.chiave} className="border-t border-neutral-100"><td className="py-1 font-medium">{m.chiave}</td><td className="text-right tabular-nums">{eur0(m.ricavo)}</td><td className="text-right tabular-nums">{eur0(m.margine)}</td><td className="text-right font-bold tabular-nums">{perc1(m.perc)}</td><td className="text-right tabular-nums">{m.n}</td></tr>
                ))}
                {!d.marginiVenditore.length && <tr><td colSpan={5} className="py-4 text-center text-neutral-500">Nessuna commessa con i costi completi nel periodo.</td></tr>}
              </tbody>
            </table></div>
          </div>
        </div>
      </Sezione>

      <Sezione titolo="📦 Cosa si vende e quanto rende" sotto="Linea di prodotto riconosciuta dalla descrizione della commessa e dalle righe della fattura. Il margine conta solo le commesse con i costi completi." colore="#16a34a">
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Fatturato per prodotto</h3>
            <Barre voci={barre(d.perCategoria, (x) => { const m = margCat.get(x.chiave); return m ? [["Margine", perc1(m.perc)]] : []; })} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Margine % per prodotto</h3>
            <Barre colore={COLORI[2]} unita="perc" vuoto="Servono commesse con costi registrati."
              voci={[...catMarg].sort((a, b) => (b.perc ?? 0) - (a.perc ?? 0)).map((c) => ({ etichetta: c.chiave, valore: c.perc ?? 0, nota: c === migliore ? "▲ top" : c === peggiore ? "▼ ultimo" : undefined, dettagli: [["Ricavo", eur0(c.ricavo)], ["Costi", eur0(c.costo)], ["Margine", eur0(c.margine)], ["Commesse", String(c.n)]] }))} />
          </div>
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          {[["💰 Commesse con più guadagno", piuGuadagno], ["🔻 Commesse con meno rendimento", menoRendimento]].map(([titolo, elenco]) => (
            <div key={titolo as string}>
              <h3 className="mb-2 text-sm font-bold text-neutral-900">{titolo as string}</h3>
              <div className="overflow-x-auto"><table className="w-full min-w-[30rem] text-xs">
                <thead className="text-neutral-500"><tr><th className="py-1 text-left">Commessa</th><th className="text-left">Prodotto</th><th className="text-right">Ricavo</th><th className="text-right">Margine</th><th className="text-right">%</th></tr></thead>
                <tbody>
                  {(elenco as typeof piuGuadagno).map((m) => (
                    <tr key={m.numero} className="border-t border-neutral-100 align-top">
                      <td className="py-1"><div className="font-semibold">{m.clienteNome}</div><div className="text-[11px] text-neutral-500">{m.numero} · {m.venditoreNome}</div></td>
                      <td className="text-[11px] text-neutral-700">{m.categoria}</td>
                      <td className="text-right tabular-nums">{eur0(m.ricavo)}</td>
                      <td className="text-right tabular-nums">{eur0(m.margine)}</td>
                      <td className={`text-right font-bold tabular-nums ${m.margine < 0 ? "text-red-700" : ""}`}>{m.margine < 0 ? "▼ " : ""}{perc1(m.perc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          ))}
        </div>
        <Tabella titolo={`Tutte le commesse del periodo (${d.margini.length})`} intestazioni={["Commessa", "Cliente", "Prodotto", "Venditore", "Ricavo", "Costi", "Margine", "%", "Valutata"]}
          righe={d.margini.map((m) => [m.numero, m.clienteNome, m.categoria, m.venditoreNome, eur0(m.ricavo), eur0(m.costo), eur0(m.margine), perc1(m.perc), m.valutabile ? "sì" : m.costo ? "costi o fatture parziali" : "senza costi"])} />
      </Sezione>

      <Sezione titolo="👥 Clienti, marchi e marketing" colore="#0d9488">
        <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
          <div><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Migliori clienti</h3><Barre voci={barre(d.clienti.slice(0, 10))} /></div>
          <div><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Per marchio</h3><Barre voci={barre(d.perMarchio)} /></div>
          <div><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Da dove arrivano (provenienza)</h3><Barre voci={barre(primeEAltri(d.perOrigine, 8))} /></div>
        </div>
      </Sezione>

      <Sezione titolo="⏳ Crediti e debiti" sotto="Quanto c'è da incassare e da pagare, diviso per ritardo. Contano le rate aperte dello scadenzario." colore="#dc2626">
        <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
          <div><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Da incassare</h3><Barre voci={d.anzianitaCrediti.map((a) => ({ etichetta: a.fascia, valore: a.importo, dettagli: [["Rate", String(a.n)]] }))} /></div>
          <div><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Da pagare</h3><Barre colore={COLORI[1]} voci={d.anzianitaDebiti.map((a) => ({ etichetta: a.fascia, valore: a.importo, dettagli: [["Rate", String(a.n)]] }))} /></div>
          <div><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Clienti con più scaduto</h3><Barre voci={barre(d.debitori.slice(0, 8))} vuoto="Nessun credito scaduto. 👍" /></div>
        </div>
        <p className="mt-3 text-xs"><Link href="/amministrazione/scadenzario" className="btn-3d btn-3d-outline inline-block px-3 py-1.5">Apri lo scadenzario</Link></p>
      </Sezione>

      <Sezione titolo="🚚 Fornitori" sotto={d.fornitori.length ? `I primi 5 fornitori valgono il ${perc1(top5Fornitori)} degli acquisti${top5Fornitori > 0.5 ? ": dipendenza alta, conviene avere alternative (vedi «fornitore alternativo» negli ordini)." : "."}` : undefined} colore="#ca8a04">
        <Barre colore={COLORI[1]} voci={barre(d.fornitori.slice(0, 12))} />
      </Sezione>

      <Sezione titolo="🏦 Banche" sotto="Saldo dei conti e quanto costano: fatture delle banche (interessi, anticipi, servizi) e commissioni registrate sui conti." colore="#334155">
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Costo delle banche nel periodo</h3>
            <Barre colore={COLORI[6]} voci={d.banche.map((b) => ({ etichetta: b.banca, valore: b.totale, dettagli: [["Fatture della banca", eur0(b.fatture)], ["Commissioni sui conti", eur0(b.commissioni)]] }))} vuoto="Nessun costo bancario registrato nel periodo." />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Saldo dei conti oggi</h3>
            {d.saldi.length ? (
              <table className="w-full text-xs"><tbody>{d.saldi.map((c) => <tr key={c.nome} className="border-t border-neutral-100"><td className="py-1 font-medium">{c.nome}</td><td className="text-neutral-500">{c.banca ?? c.tipo}</td><td className={`text-right font-bold tabular-nums ${c.saldo < 0 ? "text-red-700" : ""}`}>{eur0(c.saldo)}</td></tr>)}</tbody></table>
            ) : <p className="text-sm text-neutral-500">Nessun conto: aggiungili in Amministrazione › Banche e importa gli estratti conto, così la cassa prevista parte dal saldo vero.</p>}
          </div>
        </div>
      </Sezione>

      <Sezione titolo="🧪 Simulazioni: cosa succede se…" sotto="Sposta i cursori: il margine e la cassa si ricalcolano subito. Parte dai numeri veri del periodo e dalle scadenze aperte; non cambia nessun dato." colore="#7c3aed">
        <Simulatore base={{ ricavi: k.ricavi, costi: k.costi, crediti: k.crediti, fatturatoIvato: k.fatturatoIvato, giorniPeriodo: d.giorniPeriodo }} saldoOggi={k.saldoOggi} scadenze={d.scadenzeCassa} oggi={d.oggi.toISOString()} />
      </Sezione>

      <p className="text-[11px] leading-5 text-neutral-500">
        Come si calcola: fatturato e acquisti sono l&apos;imponibile delle fatture del periodo (note di credito in meno, proforma escluse). Il margine di una commessa è
        il fatturato della commessa meno i costi che BConsole le ha imputato (o le fatture d&apos;acquisto collegate); si giudicano solo le commesse fatturate almeno al 70%
        e, se ancora aperte, con i costi già arrivati. I giorni medi di incasso sono i crediti aperti diviso il fatturato del periodo. La cassa prevista somma al saldo di oggi
        le rate da incassare e da pagare dello scadenzario.
      </p>
    </div>
  );
}
