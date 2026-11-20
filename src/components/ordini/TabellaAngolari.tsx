"use client";

// Modulo «Angolari in alluminio per i legni» nell'ordine (richiesta di Ugo 20/11/2026): forma, lati come nella legenda, spessore, lato del bello,
// colore, lunghezza e pezzi, con costo di Il Mastro a peso e vendita × 2 mentre si scrive. Parte già compilato (righe salvate o proposta dai legni).
import { useState } from "react";
import { COLORI_LATTONERIA } from "@/lib/listini/lattoneria";
import { BELLO, FORME, LEGENDA_SVG, RIGHE_ANGOLARI, SPESSORI, angolareDellaRiga, costoBarra, kgBarra, riepilogoAngolari, spessoreLabel, venditaBarra, type Forma } from "@/lib/ordini/angolari";

const n2 = (n: number, d = 2) => n.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" as unknown as boolean });

export default function TabellaAngolari({ iniziali, proposta, salva, modificabile = true }: { iniziali: Record<string, string>; proposta: boolean; salva?: (fd: FormData) => Promise<void>; modificabile?: boolean }) {
  const [v, setV] = useState<Record<string, string>>(iniziali);
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));
  const g = (n: number, c: string, d = "") => v[`tab_ang_${n}_${c}`] ?? d;
  const r = riepilogoAngolari(v);
  const sel = "w-full px-1 py-1 text-xs bg-white";
  const inp = "w-14 px-1 py-1 text-xs";
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-neutral-800">🔩 Angolari in alluminio (Il Mastro) — legenda dei lati</p>
      <div className="overflow-x-auto rounded border border-neutral-200 bg-white p-2" dangerouslySetInnerHTML={{ __html: LEGENDA_SVG }} />
      {proposta && <p className="rounded bg-sky-50 px-2 py-1 text-[11px] text-sky-900">💡 Proposta dai legni dell&apos;ordine e della pratica (anche quelli aggiunti dal rilevatore): un angolare a L per ogni legno. Controlla forma, lati e bello prima di salvare.</p>}
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead><tr className="bg-neutral-50">
            {["#", "Forma", "A", "B", "C", "Spessore", "Bello", "Colore", "Lungh. mm", "Pezzi", "kg", "Costo Il Mastro €", "Vendita €"].map((h) => <th key={h} className="border border-neutral-300 px-1.5 py-0.5 font-semibold whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody>
            {Array.from({ length: RIGHE_ANGOLARI }, (_, i) => i + 1).map((n) => {
              const forma = (g(n, "forma", "L") as Forma) in FORME ? (g(n, "forma", "L") as Forma) : "L";
              const x = angolareDellaRiga(v, n);
              const piena = !!g(n, "pezzi");
              const campo = (c: string) => (piena ? `campo_tab_ang_${n}_${c}` : undefined);
              return (
                <tr key={n} className={x ? "bg-amber-50" : ""}>
                  <td className="px-1.5 text-neutral-500">{n}</td>
                  <td className="border border-neutral-300 p-0"><select name={campo("forma")} value={forma} onChange={(e) => set(`tab_ang_${n}_forma`, e.target.value)} className={sel}>{Object.entries(FORME).map(([k, f]) => <option key={k} value={k}>{f.nome}</option>)}</select></td>
                  {(["a", "b", "c"] as const).map((l) => (
                    <td key={l} className="border border-neutral-300 p-0">{FORME[forma].lati.includes(l)
                      ? <input name={campo(l)} inputMode="numeric" value={g(n, l)} onChange={(e) => set(`tab_ang_${n}_${l}`, e.target.value)} className={inp} placeholder="mm" aria-label={`Lato ${l.toUpperCase()} riga ${n}`} />
                      : <span className="block px-1 text-neutral-300">—</span>}</td>
                  ))}
                  <td className="border border-neutral-300 p-0"><select name={campo("spessore")} value={g(n, "spessore", "1.5")} onChange={(e) => set(`tab_ang_${n}_spessore`, e.target.value)} className={sel}>{SPESSORI.map((s) => <option key={s} value={String(s)}>{spessoreLabel(s)}</option>)}</select></td>
                  <td className="border border-neutral-300 p-0"><select name={campo("bello")} value={g(n, "bello", "EST")} onChange={(e) => set(`tab_ang_${n}_bello`, e.target.value)} className={sel}>{Object.entries(BELLO).map(([k, b]) => <option key={k} value={k}>{b}</option>)}</select></td>
                  <td className="border border-neutral-300 p-0"><select name={campo("colore")} value={g(n, "colore", "0")} onChange={(e) => set(`tab_ang_${n}_colore`, e.target.value)} className={sel}>{COLORI_LATTONERIA.map((c, i) => <option key={c.nome} value={String(i)}>{c.nome}</option>)}</select></td>
                  <td className="border border-neutral-300 p-0"><input name={campo("lunghezza")} inputMode="numeric" value={g(n, "lunghezza", "3000")} onChange={(e) => set(`tab_ang_${n}_lunghezza`, e.target.value)} className={inp} /></td>
                  <td className="border border-neutral-300 p-0"><input name={`campo_tab_ang_${n}_pezzi`} inputMode="numeric" value={g(n, "pezzi")} onChange={(e) => set(`tab_ang_${n}_pezzi`, e.target.value)} className={inp} aria-label={`Pezzi riga ${n}`} /></td>
                  <td className="border border-neutral-300 px-1.5 text-right">{x ? n2(kgBarra(x) * x.pezzi) : ""}</td>
                  <td className="border border-neutral-300 px-1.5 text-right">{x ? `${n2(costoBarra(x) * x.pezzi)}` : ""}</td>
                  <td className="border border-neutral-300 px-1.5 text-right font-semibold">{x ? n2(venditaBarra(x) * x.pezzi) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs"><b>{r.pezzi}</b> pezzi · <b>{n2(r.kg)}</b> kg · costo Il Mastro <b>{n2(r.costo)} €</b> · vendita <b>{n2(r.vendita)} €</b> <span className="text-neutral-600">(a peso: standard 14 €/kg, RAL 16, bronzo e fuori standard 18; vendita ×2. Nella scheda per il fornitore vanno forme, lati e kg, senza prezzi.)</span></p>
      {salva && modificabile && (
        <div className="flex flex-wrap items-center gap-3">
          <button formAction={salva} className="btn-3d btn-3d-green px-4 py-2 text-sm">💾 Salva gli angolari nell&apos;ordine</button>
          <span className="text-[11px] text-neutral-600">Una riga per angolare con il costo di Il Mastro a barra; la scheda da allegare si aggiorna.</span>
        </div>
      )}
    </div>
  );
}
