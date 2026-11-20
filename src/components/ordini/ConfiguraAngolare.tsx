"use client";

// Un angolare in alluminio su misura (Il Mastro), scelto come nel modulo d'ordine: forma, lati secondo la legenda, spessore, bello, colore,
// lunghezza e pezzi, con il prezzo mentre si sceglie. Si usa nell'offerta (vendita) e nel rilievo (materiale aggiuntivo, costo). Richiesta di Ugo 20/11/2026.
import { useState } from "react";
import { COLORI_LATTONERIA } from "@/lib/listini/lattoneria";
import { BELLO, FORME, LEGENDA_SVG, SPESSORI, angolareDellaRiga, codiceAngolare, costoBarra, descrizioneAngolare, spessoreLabel, venditaBarra, type Angolare, type Forma } from "@/lib/ordini/angolari";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });

export default function ConfiguraAngolare({ prezzo, onScegli, testoPulsante, nomi }: {
  prezzo: "vendita" | "costo";
  onScegli?: (x: Angolare, codice: string, descrizione: string) => void;
  testoPulsante: string;
  /** dentro un <form>: i campi hanno questi nomi e il pulsante invia il modulo (offerta) */
  nomi?: boolean;
}) {
  const [v, setV] = useState<Record<string, string>>({ tab_ang_1_forma: "L", tab_ang_1_spessore: "1.5", tab_ang_1_bello: "EST", tab_ang_1_colore: "0", tab_ang_1_lunghezza: "3000", tab_ang_1_pezzi: "1" });
  const set = (k: string, x: string) => setV((o) => ({ ...o, [`tab_ang_1_${k}`]: x }));
  const g = (k: string) => v[`tab_ang_1_${k}`] ?? "";
  const forma = (g("forma") as Forma) in FORME ? (g("forma") as Forma) : "L";
  const x = angolareDellaRiga(v, 1);
  const inp = "rounded border border-neutral-300 px-2 py-1 text-sm";
  const unit = x ? (prezzo === "vendita" ? venditaBarra(x) : costoBarra(x)) : 0;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: LEGENDA_SVG.replace('width="520" height="120"', 'width="390" height="90"') }} />
      <div className="flex flex-wrap items-end gap-2 text-xs font-semibold text-neutral-700">
        <label className="flex flex-col gap-0.5">Forma<select value={forma} onChange={(e) => set("forma", e.target.value)} className={inp}>{Object.entries(FORME).map(([k, f]) => <option key={k} value={k}>{f.nome}</option>)}</select></label>
        {FORME[forma].lati.map((l) => (
          <label key={l} className="flex flex-col gap-0.5">{l.toUpperCase()} mm<input value={g(l)} onChange={(e) => set(l, e.target.value)} inputMode="numeric" className={`${inp} w-16`} /></label>
        ))}
        <label className="flex flex-col gap-0.5">Spessore<select value={g("spessore")} onChange={(e) => set("spessore", e.target.value)} className={inp}>{SPESSORI.map((s) => <option key={s} value={String(s)}>{spessoreLabel(s)}</option>)}</select></label>
        <label className="flex flex-col gap-0.5">Bello<select value={g("bello")} onChange={(e) => set("bello", e.target.value)} className={inp}>{Object.entries(BELLO).map(([k, b]) => <option key={k} value={k}>{b}</option>)}</select></label>
        <label className="flex flex-col gap-0.5">Colore<select value={g("colore")} onChange={(e) => set("colore", e.target.value)} className={`${inp} max-w-52`}>{COLORI_LATTONERIA.map((c, i) => <option key={c.nome} value={String(i)}>{c.nome}</option>)}</select></label>
        <label className="flex flex-col gap-0.5">Lunghezza mm<input value={g("lunghezza")} onChange={(e) => set("lunghezza", e.target.value)} inputMode="numeric" className={`${inp} w-20`} /></label>
        <label className="flex flex-col gap-0.5">Pezzi<input value={g("pezzi")} onChange={(e) => set("pezzi", e.target.value)} inputMode="numeric" className={`${inp} w-14`} /></label>
      </div>
      {nomi && x && <><input type="hidden" name="codiceAngolare" value={codiceAngolare(x)} /><input type="hidden" name="quantita" value={String(x.pezzi)} /></>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-800">{x ? <><b>{descrizioneAngolare(x)}</b> · {eur(unit)} a barra{prezzo === "costo" ? " (costo Il Mastro)" : ""} · totale <b>{eur(Math.round(unit * x.pezzi * 100) / 100)}</b></> : "Scrivi le misure dei lati e i pezzi."}</span>
        <button type={nomi ? "submit" : "button"} disabled={!x} onClick={nomi ? undefined : () => x && onScegli?.(x, codiceAngolare(x), descrizioneAngolare(x))} className="btn-3d btn-3d-orange px-3 py-1.5 text-xs disabled:opacity-40">{testoPulsante}</button>
      </div>
    </div>
  );
}
