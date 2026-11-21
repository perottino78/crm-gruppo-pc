"use client";

import { useState } from "react";
import { APERTURE, COLONNE_FINESTRA, COPRIFILI } from "@/lib/ordini/serramenti";

const inp = "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm";
const lab = "block text-[11px] font-bold text-neutral-700";

/**
 * Modulo serramenti PVC: una scheda per ogni finestra (si aggiunge con un clic) invece di una tabella larga 24 colonne.
 * I campi hanno gli stessi nomi del modulo (`campo_tab_fin_<n>_<colonna>`): la scheda stampata li riempie da sola.
 */
export default function TabellaSerramenti({ righe, coprifili }: { righe: number[]; coprifili: number[] }) {
  const [visibili, setVisibili] = useState(1);
  const [legenda, setLegenda] = useState(false);
  const campo = (n: number, c: string, etichetta: string, opz: { placeholder?: string; className?: string } = {}) => (
    <label key={c} className={opz.className}><span className={lab}>{etichetta}</span>
      <input name={`campo_tab_fin_${n}_${c}`} className={inp} placeholder={opz.placeholder} inputMode={["L", "H", "traverso", "rdx", "rsx", "rsup", "rinf", "celL", "celP", "casL", "casH", "casP1", "casP2", "qta"].includes(c) ? "numeric" : undefined} />
    </label>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-neutral-900">🪟 Finestre da ordinare <span className="font-normal text-neutral-600">— una scheda per finestra, solo quelle compilate finiscono nel modulo</span></p>
        <button type="button" onClick={() => setLegenda(!legenda)} className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs font-bold text-blue-800">{legenda ? "Chiudi i disegni" : "📖 Vedi i codici apertura e il cassonetto"}</button>
      </div>
      {legenda && (
        <div className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-3 md:grid-cols-[2fr_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/immagini/serramenti/codici-apertura.png" alt="Codici apertura" className="w-full" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/immagini/serramenti/cassonetto-celino.png" alt="Cassonetto e celino" className="w-full max-w-xs" />
        </div>
      )}
      {righe.slice(0, 12).map((n, i) => (
        <section key={n} className={`${i < visibili ? "" : "hidden"} rounded-xl border-2 border-neutral-200 bg-white p-3`} aria-hidden={i >= visibili}>
          <h4 className="mb-2 text-sm font-extrabold text-neutral-900">Finestra {n}</h4>
          {i < visibili && (
            <div className="space-y-2">
              <div className="grid gap-2 md:grid-cols-6">
                {campo(n, "pos", "FIN / P.FIN", { placeholder: "es. F1" })}
                {campo(n, "stanza", "Stanza", { className: "md:col-span-2" })}
                {campo(n, "qta", "Q.tà", { placeholder: "1" })}
                {campo(n, "L", "Larghezza L (mm)")}
                {campo(n, "H", "Altezza H (mm)")}
              </div>
              <div className="grid gap-2 md:grid-cols-6">
                <label><span className={lab}>Telaio</span>
                  <select name={`campo_tab_fin_${n}_telaio`} className={inp} defaultValue=""><option value="">—</option><option>L</option><option>Z</option></select></label>
                <label className="md:col-span-2"><span className={lab}>Codice apertura (vista interna)</span>
                  <select name={`campo_tab_fin_${n}_apertura`} className={inp} defaultValue="">
                    <option value="">— scegli —</option>
                    {APERTURE.map((g) => <optgroup key={g.gruppo} label={g.gruppo}>{g.codici.map((c) => <option key={c}>{c}</option>)}</optgroup>)}
                  </select></label>
                {campo(n, "traverso", "H traverso centrale")}
                <label className="flex items-end gap-2 pb-1 text-sm font-bold md:col-span-2"><input type="checkbox" name={`campo_tab_fin_${n}_stc`} value="STC" className="h-4 w-4" /> Vetro STC</label>
              </div>
              <div className="grid gap-2 rounded-lg bg-neutral-50 p-2 md:grid-cols-4">
                <p className="text-[11px] font-extrabold uppercase text-neutral-600 md:col-span-4">Rifilo alletta (mm)</p>
                {campo(n, "rdx", "dx")}{campo(n, "rsx", "sx")}{campo(n, "rsup", "sup")}{campo(n, "rinf", "inf")}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2 rounded-lg bg-neutral-50 p-2 md:grid-cols-3">
                  <p className="text-[11px] font-extrabold uppercase text-neutral-600 md:col-span-3">Celino</p>
                  {campo(n, "celL", "Larghezza")}{campo(n, "celP", "Profondità")}{campo(n, "celC", "Colore")}
                </div>
                <div className="grid gap-2 rounded-lg bg-neutral-50 p-2 md:grid-cols-5">
                  <p className="text-[11px] font-extrabold uppercase text-neutral-600 md:col-span-5">Cassonetto PVC</p>
                  {campo(n, "casL", "Largh.")}{campo(n, "casH", "Altezza")}{campo(n, "casP1", "Prof. 1")}{campo(n, "casP2", "Prof. 2")}{campo(n, "casC", "Colore")}
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                {campo(n, "cint", "Colore interno")}{campo(n, "cext", "Colore esterno")}
                {campo(n, "nota", "Note", { className: "md:col-span-2" })}
              </div>
            </div>
          )}
        </section>
      ))}
      {visibili < Math.min(righe.length, 12) && (
        <button type="button" onClick={() => setVisibili(visibili + 1)} className="btn-3d btn-3d-blue px-4 py-2 text-sm">➕ Aggiungi un&apos;altra finestra ({visibili} di {Math.min(righe.length, 12)})</button>
      )}
      {coprifili.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="mb-1 text-sm font-extrabold">Coprifili disponibili <span className="font-normal text-neutral-600">— quanti pezzi e di che colore (lascia vuoto se non servono)</span></p>
          <div className="grid gap-x-4 gap-y-1 md:grid-cols-2">
            {coprifili.map((n) => (
              <div key={n} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0 font-semibold">{COPRIFILI[n - 1] ?? `Coprifilo ${n}`}</span>
                <input name={`campo_tab_cop_${n}_qta`} placeholder="n°" inputMode="numeric" className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm" aria-label={`${COPRIFILI[n - 1]} numero`} />
                <input name={`campo_tab_cop_${n}_col`} placeholder="colore" className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" aria-label={`${COPRIFILI[n - 1]} colore`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const COLONNE_SERRAMENTI = COLONNE_FINESTRA.map((c) => c.nome);
