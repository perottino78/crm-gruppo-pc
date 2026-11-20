"use client";

// Legno piallato su misura (richiesta di Ugo 20/11/2026): spessore, larghezza e lunghezza libere, prezzo sullo sviluppo (m³ × prezzo al m³)
// mentre si scrive. Nell'offerta il prezzo di vendita (costo × 2), al rilievo il costo. Come il configuratore degli angolari.
import { useState } from "react";
import { PREZZO_M3_INDICATIVO, costoLegno, descrizioneLegno, codiceLegno, venditaLegno, volumeBarra, type SezioneLegno } from "@/lib/ordini/legno";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });
const num = (v: string) => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };

export default function ConfiguraLegno({ prezzo, onScegli, testoPulsante, nomi }: {
  prezzo: "vendita" | "costo";
  onScegli?: (x: { sezione: SezioneLegno; lunghezza: number; pezzi: number }, codice: string, descrizione: string, nota: string) => void;
  testoPulsante: string;
  /** dentro un <form>: campi con nome e pulsante che invia (offerta) */
  nomi?: boolean;
}) {
  const [sp, setSp] = useState(""), [la, setLa] = useState(""), [lu, setLu] = useState("3000"), [pz, setPz] = useState("1"), [nota, setNota] = useState("");
  const s = { spessore: num(sp), larghezza: num(la) }, lunghezza = num(lu), pezzi = num(pz);
  const ok = s.spessore > 0 && s.larghezza > 0 && lunghezza > 0 && pezzi > 0;
  const unit = ok ? (prezzo === "vendita" ? venditaLegno(s, lunghezza) : costoLegno(s, lunghezza)) : 0;
  const inp = "rounded border border-neutral-300 px-2 py-1 text-sm";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 text-xs font-semibold text-neutral-700">
        <label className="flex flex-col gap-0.5">Spessore mm<input value={sp} onChange={(e) => setSp(e.target.value)} inputMode="numeric" placeholder="es. 30" className={`${inp} w-20`} /></label>
        <label className="flex flex-col gap-0.5">Larghezza mm<input value={la} onChange={(e) => setLa(e.target.value)} inputMode="numeric" placeholder="es. 75" className={`${inp} w-20`} /></label>
        <label className="flex flex-col gap-0.5">Lunghezza mm<input value={lu} onChange={(e) => setLu(e.target.value)} inputMode="numeric" className={`${inp} w-20`} /></label>
        <label className="flex flex-col gap-0.5">Pezzi<input value={pz} onChange={(e) => setPz(e.target.value)} inputMode="numeric" className={`${inp} w-16`} /></label>
        <label className="flex min-w-[14rem] flex-1 flex-col gap-0.5">Nota (facoltativa)<input value={nota} onChange={(e) => setNota(e.target.value)} name={nomi ? "notaLegno" : undefined} placeholder="es. larice, piallato 4 lati" className={inp} /></label>
      </div>
      {nomi && ok && <><input type="hidden" name="codiceLegno" value={codiceLegno(s, lunghezza)} /><input type="hidden" name="quantita" value={String(pezzi)} /></>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-800">{ok
          ? <><b>{descrizioneLegno(s, lunghezza)}</b> · {volumeBarra(s, lunghezza).toLocaleString("it-IT", { maximumFractionDigits: 4 })} m³ a barra · {eur(unit)} a barra{prezzo === "costo" ? ` (costo indicativo ${PREZZO_M3_INDICATIVO} €/m³)` : ""} · totale <b>{eur(Math.round(unit * pezzi * 100) / 100)}</b></>
          : "Scrivi spessore, larghezza, lunghezza e pezzi."}</span>
        <button type={nomi ? "submit" : "button"} disabled={!ok} onClick={nomi ? undefined : () => { if (!ok) return; onScegli?.({ sezione: s, lunghezza, pezzi }, codiceLegno(s, lunghezza), descrizioneLegno(s, lunghezza), nota.trim()); setNota(""); }} className="btn-3d btn-3d-orange px-3 py-1.5 text-xs disabled:opacity-40">{testoPulsante}</button>
      </div>
    </div>
  );
}
