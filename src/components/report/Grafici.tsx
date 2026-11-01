"use client";

// Grafici dei report: barre orizzontali in classifica, colonne mese per mese, linea della cassa prevista.
// Regole (skill dataviz): colori categoriali in ordine fisso, un solo asse, legenda con 2+ serie,
// segni sottili con estremità arrotondate di 4px, tooltip al passaggio del mouse e tabella sotto ogni grafico.
import { useRef, useState, type ReactNode } from "react";
import { COLORI, eur0, perc1 } from "@/lib/report/formato";
const corto = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 1 })} mln`;
  if (a >= 1e3) return `${Math.round(n / 1e3).toLocaleString("it-IT")}k`;
  return Math.round(n).toLocaleString("it-IT");
};

type Tip = { x: number; y: number; contenuto: ReactNode } | null;

function useTooltip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const mostra = (e: React.MouseEvent, contenuto: ReactNode) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, contenuto });
  };
  const nascondi = () => setTip(null);
  const vista = tip && (
    <div
      className="pointer-events-none absolute z-20 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 shadow-lg"
      style={{ left: Math.min(tip.x + 14, (box.current?.clientWidth ?? 400) - 220), top: tip.y + 14, minWidth: 160, maxWidth: 240 }}
    >
      {tip.contenuto}
    </div>
  );
  return { box, mostra, nascondi, vista };
}

const Riga = ({ colore, nome, valore }: { colore?: string; nome: string; valore: string }) => (
  <div className="flex items-center gap-2 leading-5">
    {colore && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colore }} />}
    <span className="text-neutral-600">{nome}</span>
    <span className="ml-auto font-semibold tabular-nums text-neutral-900">{valore}</span>
  </div>
);

export function Tabella({ titolo = "Vedi i numeri in tabella", intestazioni, righe }: { titolo?: string; intestazioni: string[]; righe: (string | number)[][] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer select-none font-semibold text-neutral-600 hover:text-neutral-900">{titolo}</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded border border-neutral-200">
        <table className="w-full">
          <thead className="sticky top-0 bg-neutral-50 text-neutral-600">
            <tr>{intestazioni.map((h, i) => <th key={h} className={`px-2 py-1 font-semibold ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {righe.map((r, i) => (
              <tr key={i} className="border-t border-neutral-100">
                {r.map((c, j) => <td key={j} className={`px-2 py-1 ${j ? "text-right tabular-nums" : ""}`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export type VoceBarra = { etichetta: string; valore: number; dettagli?: [string, string][]; nota?: string };

/** Classifica a barre orizzontali (una sola serie: il titolo dice cosa misura, niente legenda). */
export function Barre({ voci, colore = COLORI[0], unita = "eur", vuoto = "Nessun dato nel periodo." }: { voci: VoceBarra[]; colore?: string; unita?: "eur" | "perc"; vuoto?: string }) {
  const t = useTooltip();
  const formato = unita === "perc" ? perc1 : eur0;
  if (!voci.length) return <p className="py-6 text-center text-sm text-neutral-500">{vuoto}</p>;
  const max = Math.max(...voci.map((v) => Math.abs(v.valore)), 1);
  return (
    <div ref={t.box} className="relative" onMouseLeave={t.nascondi}>
      <ul className="space-y-1.5">
        {voci.map((v) => (
          <li
            key={v.etichetta}
            className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-neutral-50 sm:grid-cols-[minmax(0,13rem)_1fr_auto]"
            onMouseMove={(e) => t.mostra(e, <><div className="mb-1 font-bold">{v.etichetta}</div><Riga nome="Valore" valore={formato(v.valore)} />{v.dettagli?.map(([n, x]) => <Riga key={n} nome={n} valore={x} />)}</>)}
          >
            <span className="truncate font-medium text-neutral-800" title={v.etichetta}>{v.etichetta}</span>
            <span className="relative h-3.5">
              <span className="absolute inset-y-0 left-0 rounded-r" style={{ width: `${Math.max(1.5, (Math.abs(v.valore) / max) * 100)}%`, background: colore, opacity: v.valore < 0 ? 0.45 : 1 }} />
            </span>
            <span className="w-24 text-right font-semibold tabular-nums text-neutral-900">{formato(v.valore)}{v.nota && <span className="ml-1 font-normal text-neutral-500">{v.nota}</span>}</span>
          </li>
        ))}
      </ul>
      {t.vista}
    </div>
  );
}

export type Serie = { nome: string; colore: string; valori: number[] };

/** Colonne affiancate per periodo (es. vendite e acquisti per mese), un solo asse in euro. */
export function Colonne({ etichette, serie, altezza = 230 }: { etichette: string[]; serie: Serie[]; altezza?: number }) {
  const t = useTooltip();
  const W = 760, H = altezza, sx = 46, dx = 8, alto = 12, basso = 26;
  const max = Math.max(1, ...serie.flatMap((s) => s.valori));
  const passo = Math.pow(10, Math.floor(Math.log10(max)));
  const tacca = [1, 2, 2.5, 5, 10].map((k) => k * passo).find((k) => max / k <= 5) ?? passo * 10;
  const cima = Math.ceil(max / tacca) * tacca;
  const y = (v: number) => alto + (H - alto - basso) * (1 - v / cima);
  const banda = (W - sx - dx) / etichette.length;
  const larg = Math.min(22, (banda * 0.72) / serie.length);
  return (
    <div ref={t.box} className="relative" onMouseLeave={t.nascondi}>
      {serie.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-4 text-xs text-neutral-700">
          {serie.map((s) => <span key={s.nome} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.colore }} />{s.nome}</span>)}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={serie.map((s) => s.nome).join(" e ")}>
        {Array.from({ length: Math.round(cima / tacca) + 1 }, (_, i) => i * tacca).map((v) => (
          <g key={v}>
            <line x1={sx} x2={W - dx} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#a3a3a3" : "#ececec"} strokeWidth={1} />
            <text x={sx - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10.5} fill="#737373">{corto(v)}</text>
          </g>
        ))}
        {etichette.map((et, i) => {
          const x0 = sx + i * banda + (banda - larg * serie.length - 2 * (serie.length - 1)) / 2;
          return (
            <g key={et}
              onMouseMove={(e) => t.mostra(e, <><div className="mb-1 font-bold">{et}</div>{serie.map((s) => <Riga key={s.nome} colore={s.colore} nome={s.nome} valore={eur0(s.valori[i])} />)}</>)}>
              <rect x={sx + i * banda} y={alto} width={banda} height={H - alto - basso} fill="transparent" className="hover:fill-neutral-100/60" />
              {serie.map((s, j) => {
                const v = Math.max(0, s.valori[i]);
                const h = y(0) - y(v);
                const x = x0 + j * (larg + 2);
                const r = Math.min(4, h, larg / 2);
                return h > 0 ? <path key={s.nome} d={`M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + larg - r} Q${x + larg},${y(v)} ${x + larg},${y(v) + r} V${y(0)} Z`} fill={s.colore} /> : null;
              })}
              <text x={sx + i * banda + banda / 2} y={H - 8} textAnchor="middle" fontSize={10.5} fill="#525252">{et}</text>
            </g>
          );
        })}
      </svg>
      {t.vista}
    </div>
  );
}

export type PuntoCassa = { etichetta: string; saldo: number; incassi: number; pagamenti: number };

/** Saldo previsto settimana per settimana (linea di 2px, crosshair e tooltip; la linea dello zero se si va sotto). */
export function LineaCassa({ punti, colore = COLORI[0] }: { punti: PuntoCassa[]; colore?: string }) {
  const t = useTooltip();
  const [attivo, setAttivo] = useState<number | null>(null);
  if (!punti.length) return null;
  const W = 760, H = 220, sx = 56, dx = 12, alto = 14, basso = 26;
  const vals = punti.map((p) => p.saldo);
  let min = Math.min(0, ...vals), max = Math.max(...vals, 1);
  const marg = (max - min) * 0.08 || 1; max += marg; if (min < 0) min -= marg;
  const y = (v: number) => alto + (H - alto - basso) * (1 - (v - min) / (max - min));
  const x = (i: number) => sx + (i * (W - sx - dx)) / Math.max(1, punti.length - 1);
  const d = punti.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.saldo)}`).join(" ");
  const tacche = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  return (
    <div ref={t.box} className="relative" onMouseLeave={() => { t.nascondi(); setAttivo(null); }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Saldo previsto delle banche"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.max(0, Math.min(punti.length - 1, Math.round(((px - sx) / (W - sx - dx)) * (punti.length - 1))));
          setAttivo(i);
          const p = punti[i];
          t.mostra(e, <><div className="mb-1 font-bold">Settimana del {p.etichetta}</div><Riga nome="Incassi attesi" valore={eur0(p.incassi)} /><Riga nome="Pagamenti" valore={eur0(-p.pagamenti)} /><Riga colore={colore} nome="Saldo a fine settimana" valore={eur0(p.saldo)} /></>);
        }}>
        {tacche.map((v) => (
          <g key={v}>
            <line x1={sx} x2={W - dx} y1={y(v)} y2={y(v)} stroke="#ececec" />
            <text x={sx - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10.5} fill="#737373">{corto(v)}</text>
          </g>
        ))}
        {min < 0 && <><line x1={sx} x2={W - dx} y1={y(0)} y2={y(0)} stroke="#525252" strokeDasharray="4 3" /><text x={W - dx} y={y(0) - 4} textAnchor="end" fontSize={10.5} fill="#525252">zero</text></>}
        <path d={d} fill="none" stroke={colore} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {punti.map((p, i) => (i % 2 === 0 || i === punti.length - 1) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10.5} fill="#525252">{p.etichetta}</text>)}
        {attivo !== null && (
          <g>
            <line x1={x(attivo)} x2={x(attivo)} y1={alto} y2={H - basso} stroke="#a3a3a3" />
            <circle cx={x(attivo)} cy={y(punti[attivo].saldo)} r={5} fill={colore} stroke="#fff" strokeWidth={2} />
          </g>
        )}
        <circle cx={x(punti.length - 1)} cy={y(punti[punti.length - 1].saldo)} r={4} fill={colore} stroke="#fff" strokeWidth={2} />
      </svg>
      {t.vista}
    </div>
  );
}
