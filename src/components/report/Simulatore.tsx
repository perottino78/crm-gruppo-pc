"use client";

// "Cosa succede se…": prezzi, costi dei fornitori, volumi e tempi di incasso → margine e cassa.
// I calcoli sono quelli di src/lib/report/calcoli.ts (simula, previsioneCassa), qui solo i cursori.
import { useMemo, useState } from "react";
import { simula, previsioneCassa, type Base } from "@/lib/report/calcoli";
import { LineaCassa, Tabella } from "./Grafici";
import { COLORI, eur0, perc1 } from "@/lib/report/formato";

type Sc = { t: string; r: number; d: string | null };

function Cursore({ nome, valore, min, max, passo = 1, unita, onChange, aiuto, variazione = false }: { nome: string; valore: number; min: number; max: number; passo?: number; unita: string; onChange: (n: number) => void; aiuto: string; variazione?: boolean }) {
  return (
    <label className="block rounded-lg border border-neutral-200 bg-white p-3">
      <span className="flex items-baseline justify-between text-xs font-bold text-neutral-800">
        {nome}
        <span className="tabular-nums text-sm font-extrabold text-neutral-900">{valore > 0 && variazione ? "+" : ""}{valore}{unita === "%" ? "%" : ` ${unita}`}</span>
      </span>
      <input type="range" min={min} max={max} step={passo} value={valore} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-blue-600" aria-label={nome} />
      <span className="mt-1 block text-[11px] leading-4 text-neutral-500">{aiuto}</span>
    </label>
  );
}

const Esito = ({ titolo, valore, sotto, evidenzia }: { titolo: string; valore: string; sotto?: string; evidenzia?: "su" | "giu" | null }) => (
  <div className="rounded-lg border border-neutral-200 bg-white p-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{titolo}</div>
    <div className="mt-0.5 text-xl font-extrabold tabular-nums text-neutral-900">{valore}</div>
    {sotto && <div className={`text-xs font-semibold ${evidenzia === "su" ? "text-green-700" : evidenzia === "giu" ? "text-red-700" : "text-neutral-500"}`}>{evidenzia === "su" ? "▲ " : evidenzia === "giu" ? "▼ " : ""}{sotto}</div>}
  </div>
);

export default function Simulatore({ base, saldoOggi, scadenze, oggi }: { base: Base; saldoOggi: number; scadenze: Sc[]; oggi: string }) {
  const [prezzi, setPrezzi] = useState(0);
  const [costi, setCosti] = useState(0);
  const [volumi, setVolumi] = useState(0);
  const [giorni, setGiorni] = useState(0);
  const [recupero, setRecupero] = useState(50);
  const [ritardo, setRitardo] = useState(0);
  const [debitiScaduti, setDebitiScaduti] = useState(100);
  const r = simula(base, { prezzi, costi, volumi, giorniIncassoMeno: giorni });
  const cassa = useMemo(() => previsioneCassa(
    saldoOggi,
    scadenze.map((s) => ({ tipo: s.t === "I" ? "INCASSO" as const : "PAGAMENTO" as const, residuo: s.r, dataScadenza: s.d ? new Date(s.d) : null, controparte: "" })),
    new Date(oggi), 13, { recuperoScaduti: recupero / 100, ritardoIncassiGiorni: Math.max(0, ritardo - giorni), pagamentiScaduti: debitiScaduti / 100 },
  ), [saldoOggi, scadenze, oggi, recupero, ritardo, giorni, debitiScaduti]);
  const punti = cassa.map((w) => ({ etichetta: w.inizio.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" }), saldo: w.saldo, incassi: w.incassi, pagamenti: w.pagamenti }));
  const minimo = cassa.reduce((m, w) => (w.saldo < m.saldo ? w : m), cassa[0]);
  const azzera = () => { setPrezzi(0); setCosti(0); setVolumi(0); setGiorni(0); setRecupero(50); setRitardo(0); setDebitiScaduti(100); };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Cursore variazione nome="Prezzi di vendita" valore={prezzi} min={-10} max={15} unita="%" onChange={setPrezzi} aiuto="Listini e sconti: +3% = 3 euro in più ogni 100 venduti." />
        <Cursore variazione nome="Costi dei fornitori" valore={-costi} min={-15} max={10} unita="%" onChange={(n) => setCosti(-n)} aiuto="Sconti dai fornitori (negativo = si paga meno) o aumenti dei listini." />
        <Cursore variazione nome="Lavori venduti (volumi)" valore={volumi} min={-30} max={30} unita="%" onChange={setVolumi} aiuto="Più o meno contratti, con gli stessi prezzi." />
        <Cursore nome="Incassi più veloci" valore={giorni} min={0} max={60} unita="giorni" onChange={setGiorni} aiuto="Acconti più alti, saldo alla fine posa, solleciti puntuali." />
        <Cursore nome="Scaduti che si recuperano" valore={recupero} min={0} max={100} passo={10} unita="%" onChange={setRecupero} aiuto="Quanta parte dei crediti già scaduti entra nelle prossime settimane." />
        <Cursore nome="Fornitori scaduti da pagare ora" valore={debitiScaduti} min={0} max={100} passo={10} unita="%" onChange={setDebitiScaduti} aiuto="Fatture fornitori già scadute: se molte sono già pagate ma non segnate, abbassa." />
        <Cursore nome="Ritardo medio dei clienti" valore={ritardo} min={0} max={45} unita="giorni" onChange={setRitardo} aiuto="Clienti che pagano dopo la scadenza (prudenza sulla cassa)." />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Esito titolo="Ricavi" valore={eur0(r.ricavi)} sotto={`prima ${eur0(base.ricavi)}`} />
        <Esito titolo="Margine (vendite − acquisti)" valore={eur0(r.margine)} sotto={r.differenzaMargine === 0 ? `${perc1(r.perc)} dei ricavi` : `${r.differenzaMargine > 0 ? "+" : ""}${eur0(r.differenzaMargine)} · ${perc1(r.perc)}`} evidenzia={r.differenzaMargine > 0 ? "su" : r.differenzaMargine < 0 ? "giu" : null} />
        <Esito titolo="Giorni medi di incasso" valore={r.dsoDopo === null ? "—" : `${r.dsoDopo} gg`} sotto={r.dsoPrima === null ? undefined : `oggi ${r.dsoPrima} gg`} evidenzia={r.dsoDopo !== null && r.dsoPrima !== null && r.dsoDopo < r.dsoPrima ? "su" : null} />
        <Esito titolo="Cassa liberata" valore={eur0(r.cassaLiberata)} sotto="soldi che entrano prima" evidenzia={r.cassaLiberata > 0 ? "su" : null} />
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-3">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-neutral-900">Saldo delle banche previsto — prossime 13 settimane</h3>
          <span className="text-xs text-neutral-600">Punto più basso: <b className="tabular-nums">{eur0(minimo.saldo)}</b> (settimana del {minimo.inizio.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" })}){minimo.saldo < 0 && <b className="ml-1 text-red-700">⚠ sotto zero</b>}</span>
        </div>
        <LineaCassa punti={punti} colore={COLORI[0]} />
        <Tabella intestazioni={["Settimana del", "Incassi attesi", "Pagamenti", "Saldo"]} righe={punti.map((p) => [p.etichetta, eur0(p.incassi), eur0(-p.pagamenti), eur0(p.saldo)])} />
      </div>
      <button type="button" onClick={azzera} className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">Rimetti com&apos;è oggi</button>
    </div>
  );
}
