export const dynamic = "force-dynamic";

import Link from "next/link";
import { BRANDS } from "@/lib/brands";
import { periodoDa, analisiCompetenza, analisiCassa, andamentoMensile } from "@/lib/amministrazione/analisi";
import { cent } from "@/lib/amministrazione/estratto";
import { eur, dataIt } from "@/lib/amministrazione/costanti";
import VisteSalvate from "@/components/amministrazione/VisteSalvate";

type P = { preset?: string; da?: string; a?: string; divisione?: string; margini?: string; ordina?: string };
const inp = "border border-neutral-300 rounded px-2 py-1 text-xs bg-white";
const perc = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`);

export default async function CostiRicaviPage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const periodo = periodoDa(p);
  const brand = BRANDS.some((b) => b.nome === p.divisione) ? p.divisione : undefined;
  const [comp, cassa, andamento] = await Promise.all([analisiCompetenza(periodo, brand), analisiCassa(periodo, brand), andamentoMensile(periodo, brand)]);

  const qsObj = { preset: p.preset, da: p.da, a: p.a, divisione: p.divisione, margini: p.margini, ordina: p.ordina };
  const qs = (extra: Partial<P>) => {
    const u = new URLSearchParams();
    Object.entries({ ...qsObj, ...extra }).forEach(([k, v]) => v && u.set(k, v));
    const s = u.toString();
    return s ? `?${s}` : "";
  };
  const pill = (a: boolean) => `px-3 py-1 rounded-full text-xs font-semibold border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"}`;

  const conCosti = comp.margini.filter((m) => m.costi.totale > 0);
  const venditaConCosti = cent(conCosti.reduce((t, m) => t + m.vendita, 0));
  const margineMedio = venditaConCosti > 0 ? ((venditaConCosti - conCosti.reduce((t, m) => t + m.costi.totale, 0)) / venditaConCosti) * 100 : null;

  let margini = comp.margini;
  if (p.margini === "con-costi") margini = margini.filter((m) => m.costi.totale > 0);
  if (p.margini === "senza-costi") margini = margini.filter((m) => m.costi.totale === 0 || m.costi.righeSenzaCosto > 0);
  margini = [...margini].sort((a, b) => {
    if (p.ordina === "data") return b.data.getTime() - a.data.getTime();
    if (p.ordina === "vendita") return b.vendita - a.vendita;
    return (a.marginePerc ?? 999) - (b.marginePerc ?? 999);
  });

  // grafico andamento
  const W = 760, H = 210, pad = 34;
  const max = Math.max(1, ...andamento.flatMap((m) => [m.venduto, m.entrate, m.uscite]));
  const col = (W - pad * 2) / andamento.length;
  const h = (v: number) => ((H - pad * 2) * v) / max;
  const maxLinea = Math.max(1, ...comp.perLinea.map((l) => l.venduto));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 items-center">
        {[["mese", "Mese"], ["mese-scorso", "Mese scorso"], ["trimestre", "Trimestre"], ["anno", "Anno in corso"], ["anno-scorso", "Anno scorso"], ["12mesi", "Ultimi 12 mesi"]].map(([v, l]) => (
          <Link key={v} href={qs({ preset: v, da: undefined, a: undefined })} className={pill(periodo.preset === v)}>{l}</Link>
        ))}
        <form className="flex gap-1 items-center ml-1">
          {p.divisione && <input type="hidden" name="divisione" value={p.divisione} />}
          <input type="date" name="da" defaultValue={p.da} className={inp} /><span className="text-xs">–</span>
          <input type="date" name="a" defaultValue={p.a} className={inp} />
          <button className="btn-3d btn-3d-dark text-[11px] px-2">Applica</button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-semibold text-neutral-500">Divisione:</span>
        <Link href={qs({ divisione: undefined })} className={pill(!brand)}>Tutte</Link>
        {BRANDS.map((b) => <Link key={b.nome} href={qs({ divisione: b.nome })} className={pill(brand === b.nome)}>{b.nome}</Link>)}
      </div>
      <VisteSalvate pagina="/amministrazione/costi-ricavi" query={qs({})} />

      <p className="text-sm text-neutral-700">Periodo: <b className="capitalize">{periodo.etichetta}</b>{brand && <> · divisione <b>{brand}</b></>}</p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi titolo="Venduto (imponibile)" valore={eur(comp.venduto)} nota={`${comp.numeroCommesse} commesse confermate`} cls="text-neutral-900" />
        <Kpi titolo="Incassato" valore={eur(cassa.totRicavi)} nota="dalla prima nota, IVA inclusa" cls="text-green-700" />
        <Kpi titolo="Uscite" valore={eur(cassa.totCosti)} nota="dalla prima nota, IVA inclusa" cls="text-orange-700" />
        <Kpi titolo="Risultato di cassa" valore={eur(cassa.risultato)} nota="incassato − uscite" cls={cassa.risultato < 0 ? "text-red-600" : "text-neutral-900"} />
        <Kpi titolo="Margine medio commesse" valore={perc(margineMedio)} nota={`su ${conCosti.length} commesse con costi registrati`} cls={margineMedio !== null && margineMedio < 25 ? "text-red-600" : "text-neutral-900"} />
      </div>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h2 className="font-bold text-neutral-900">Andamento mensile</h2>
        <p className="text-[11px] text-neutral-500 mb-2">
          <span className="inline-block w-2.5 h-2.5 bg-neutral-800 rounded-sm align-middle" /> venduto (imponibile)
          <span className="inline-block w-2.5 h-2.5 bg-green-600 rounded-sm align-middle ml-3" /> incassato
          <span className="inline-block w-2.5 h-2.5 bg-orange-600 rounded-sm align-middle ml-3" /> uscite
        </p>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[620px]" role="img" aria-label="Andamento mensile">
            <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="#d4d4d4" />
            {andamento.map((m, i) => {
              const x = pad + i * col;
              const b = col * 0.24;
              return (
                <g key={i}>
                  {[[m.venduto, "#262626", "Venduto"], [m.entrate, "#16a34a", "Incassato"], [m.uscite, "#ea580c", "Uscite"]].map(([v, c, l], j) => (
                    <rect key={j} x={x + col * 0.12 + j * b} width={b - 1} y={H - pad - h(v as number)} height={h(v as number)} fill={c as string}><title>{`${l} ${eur(v as number)}`}</title></rect>
                  ))}
                  <text x={x + col / 2} y={H - pad + 14} textAnchor="middle" fontSize="10" fill="#525252">{m.mese.toLocaleDateString("it-IT", { month: "short", timeZone: "UTC" })}</text>
                  <text x={x + col / 2} y={H - pad + 26} textAnchor="middle" fontSize="9" fill="#a3a3a3">{m.mese.getUTCFullYear() % 100}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <Colonna titolo="Incassi" sottotitolo="per linea di prodotto (incassi delle commesse) e per categoria" voci={cassa.ricavi} totale={cassa.totRicavi} cls="text-green-700" />
        <Colonna titolo="Costi" sottotitolo="per categoria" voci={cassa.costi} totale={cassa.totCosti} cls="text-orange-700" />
      </section>
      <p className="text-[11px] text-neutral-500 -mt-2">
        Bilancino di cassa, importi IVA inclusa. Esclusi giroconti, prelievi/versamenti e storni ({eur(cassa.interni)}).
        {brand && cassa.nonAttribuiti > 0 && <> {cassa.nonAttribuiti} movimenti senza divisione non sono conteggiati: assegnala dalla prima nota.</>}
        {" "}<a href={`/api/amministrazione/export${qs({}) ? qs({}) + "&" : "?"}vista=bilancino`} className="underline">⬇ Excel bilancino</a>
      </p>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h2 className="font-bold text-neutral-900 mb-1">Venduto per linea di prodotto</h2>
        <p className="text-[11px] text-neutral-500 mb-3">Commesse confermate nel periodo, imponibile ripartito sulle righe del preventivo. Il margine è calcolato solo sulle commesse con costi già registrati.</p>
        {comp.perLinea.length === 0 ? <p className="text-sm text-neutral-500">Nessuna commessa nel periodo.</p> : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-neutral-500"><tr><th className="text-left py-1">Linea</th><th className="w-[40%]"></th><th className="text-right">Venduto</th><th className="text-right">Quota</th><th className="text-right">Commesse</th><th className="text-right">Margine</th></tr></thead>
            <tbody>
              {comp.perLinea.map((l) => (
                <tr key={l.linea} className="border-t border-neutral-100">
                  <td className="py-1.5 font-semibold">{l.linea}</td>
                  <td className="px-2"><div className="h-3 bg-neutral-100 rounded"><div className="h-3 rounded bg-neutral-800" style={{ width: `${(l.venduto / maxLinea) * 100}%` }} /></div></td>
                  <td className="text-right whitespace-nowrap">{eur(l.venduto)}</td>
                  <td className="text-right text-neutral-600">{perc(comp.venduto ? (l.venduto / comp.venduto) * 100 : 0)}</td>
                  <td className="text-right text-neutral-600">{l.commesse || ""}</td>
                  <td className={`text-right font-semibold ${l.marginePerc !== null && l.marginePerc < 25 ? "text-red-600" : ""}`}>{perc(l.marginePerc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="font-bold text-neutral-900 mr-2">Margine per commessa</h2>
          {[["", "Tutte"], ["con-costi", "Con costi registrati"], ["senza-costi", "Costi mancanti"]].map(([v, l]) => <Link key={v} href={qs({ margini: v || undefined })} className={pill((p.margini ?? "") === v)}>{l}</Link>)}
          <span className="text-xs text-neutral-500 ml-2">Ordina:</span>
          {[["", "margine più basso"], ["vendita", "importo"], ["data", "più recenti"]].map(([v, l]) => <Link key={v} href={qs({ ordina: v || undefined })} className={`text-xs ${(p.ordina ?? "") === v ? "font-bold underline" : "text-neutral-600 hover:underline"}`}>{l}</Link>)}
          <a href={`/api/amministrazione/export${qs({}) ? qs({}) + "&" : "?"}vista=margini`} className="ml-auto btn-3d btn-3d-outline text-xs px-3">⬇ Excel</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="text-[11px] uppercase text-neutral-500 bg-neutral-50"><tr>
              <th className="text-left px-2 py-1.5">Commessa</th><th className="text-left">Cliente</th><th className="text-left">Linea principale</th>
              <th className="text-right">Vendita</th><th className="text-right">Manodopera</th><th className="text-right">Materiale</th><th className="text-right">Altro</th>
              <th className="text-right">Margine</th><th className="text-right pr-2">%</th></tr></thead>
            <tbody>
              {margini.length === 0 && <tr><td colSpan={9} className="text-center text-neutral-500 py-6">Nessuna commessa.</td></tr>}
              {margini.map((m) => (
                <tr key={m.id} className="border-t border-neutral-100">
                  <td className="px-2 py-1.5 whitespace-nowrap"><Link href={`/commesse/${m.id}`} className="underline font-semibold">{m.numero}</Link><span className="block text-[10px] text-neutral-500">{dataIt(m.data)} · {m.brand}</span></td>
                  <td>{m.cliente}</td>
                  <td className="text-neutral-700">{m.linea}</td>
                  <td className="text-right whitespace-nowrap">{eur(m.vendita)}</td>
                  <td className="text-right whitespace-nowrap text-neutral-600">{m.costi.manodopera ? eur(m.costi.manodopera) : "—"}</td>
                  <td className="text-right whitespace-nowrap text-neutral-600">{m.costi.materiale ? eur(m.costi.materiale) : "—"}{m.costi.righeSenzaCosto > 0 && <span className="block text-[10px] text-amber-700">{m.costi.righeSenzaCosto} righe senza costo</span>}</td>
                  <td className="text-right whitespace-nowrap text-neutral-600">{m.costi.altro ? eur(m.costi.altro) : "—"}</td>
                  <td className="text-right whitespace-nowrap font-semibold">{m.costi.totale ? eur(m.margine) : <span className="text-amber-700 text-xs">costi da registrare</span>}</td>
                  <td className={`text-right pr-2 font-bold ${m.marginePerc !== null && m.marginePerc < 25 ? "text-red-600" : m.marginePerc !== null && m.marginePerc >= 40 ? "text-green-700" : ""}`}>{perc(m.marginePerc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-neutral-500 mt-2">Vendita = imponibile della commessa. Costi presi dalla scheda commessa (fasi chiuse, costi materiale degli ordini, costi extra). In rosso i margini sotto il 25%.</p>
      </section>
    </div>
  );
}

function Kpi({ titolo, valore, nota, cls }: { titolo: string; valore: string; nota: string; cls: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{titolo}</p>
      <p className={`text-lg font-extrabold mt-0.5 ${cls}`}>{valore}</p>
      <p className="text-[11px] text-neutral-500">{nota}</p>
    </div>
  );
}

function Colonna({ titolo, sottotitolo, voci, totale, cls }: { titolo: string; sottotitolo: string; voci: { voce: string; totale: number; dettaglio: { id: string; data: Date; descrizione: string; importo: number; conto: string }[] }[]; totale: number; cls: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4">
      <div className="flex justify-between items-baseline">
        <h2 className="font-bold text-neutral-900">{titolo}</h2>
        <span className={`font-extrabold ${cls}`}>{eur(totale)}</span>
      </div>
      <p className="text-[11px] text-neutral-500 mb-2">{sottotitolo}</p>
      {voci.length === 0 && <p className="text-sm text-neutral-500">Nessun movimento nel periodo.</p>}
      <div className="divide-y divide-neutral-100">
        {voci.map((v) => (
          <details key={v.voce} className="py-1.5">
            <summary className="cursor-pointer flex justify-between gap-2 text-sm list-none">
              <span className={v.voce === "Da classificare" ? "text-amber-700 font-semibold" : "text-neutral-800"}>▸ {v.voce} <span className="text-[10px] text-neutral-400">({v.dettaglio.length})</span></span>
              <span className="font-semibold whitespace-nowrap">{eur(v.totale)} <span className="text-[10px] text-neutral-400 font-normal">{totale ? Math.round((v.totale / totale) * 100) : 0}%</span></span>
            </summary>
            <table className="w-full text-xs mt-1 bg-neutral-50">
              <tbody>
                {v.dettaglio.slice(0, 40).map((d, i) => (
                  <tr key={d.id + i} className="border-t border-neutral-100">
                    <td className="px-2 py-0.5 whitespace-nowrap">{dataIt(d.data)}</td>
                    <td className="px-2 py-0.5">{d.descrizione}<span className="text-neutral-400"> · {d.conto}</span></td>
                    <td className="px-2 py-0.5 text-right whitespace-nowrap">{eur(d.importo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {v.dettaglio.length > 40 && <p className="text-[10px] text-neutral-500 px-2">…e altri {v.dettaglio.length - 40}: usa la prima nota o l&apos;Excel.</p>}
            {v.voce === "Da classificare" && <Link href="/amministrazione/prima-nota?stato=DA_ABBINARE" className="text-[11px] underline text-amber-800 px-2">Vai a classificarli →</Link>}
          </details>
        ))}
      </div>
    </div>
  );
}
