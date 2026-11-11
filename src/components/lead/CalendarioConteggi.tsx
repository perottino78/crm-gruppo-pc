"use client";

import { useState } from "react";
import { grigliaMese, meseVicino } from "@/lib/lead/elenco";

const NOMI_MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** Calendario per scegliere il giorno della ricerca, con sotto ogni giorno quanti task ci sono (come i prezzi di un sito di prenotazioni). */
export default function CalendarioConteggi({ conteggi, iniziale, meseIniziale, nome = "giorno" }: { conteggi: Record<string, number>; iniziale?: string | null; meseIniziale: string; nome?: string }) {
  const [scelto, setScelto] = useState<string | null>(iniziale ?? null);
  const [mese, setMese] = useState(meseIniziale);
  const [aperto, setAperto] = useState(false);
  const [a, m] = mese.split("-").map(Number);
  const etichetta = scelto ? scelto.split("-").reverse().join("/") : "qualsiasi giorno";
  return (
    <div className="relative">
      <input type="hidden" name={nome} value={scelto ?? ""} />
      <button type="button" onClick={() => setAperto(!aperto)} className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm bg-white min-w-[150px] text-left">📅 {etichetta}</button>
      {scelto && <button type="button" onClick={() => setScelto(null)} className="ml-1 text-xs text-neutral-600 underline">togli</button>}
      {aperto && (
        <div className="absolute right-0 z-30 mt-1 w-[300px] max-w-[calc(100vw-2rem)] rounded-lg border border-neutral-200 bg-white p-2 shadow-xl">
          <div className="flex items-center justify-between mb-1">
            <button type="button" onClick={() => setMese(meseVicino(mese, -1))} className="px-2 py-1 rounded hover:bg-neutral-100" aria-label="Mese prima">‹</button>
            <b className="text-sm capitalize">{NOMI_MESI[m - 1]} {a}</b>
            <button type="button" onClick={() => setMese(meseVicino(mese, 1))} className="px-2 py-1 rounded hover:bg-neutral-100" aria-label="Mese dopo">›</button>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] text-neutral-500">{["L", "M", "M", "G", "V", "S", "D"].map((g, i) => <span key={i}>{g}</span>)}</div>
          {grigliaMese(mese).map((sett, i) => (
            <div key={i} className="grid grid-cols-7 gap-0.5 mt-0.5">
              {sett.map((g, j) => g ? (
                <button key={g} type="button" onClick={() => { setScelto(g); setAperto(false); }}
                  className={`rounded px-0.5 py-1 text-center leading-tight ${scelto === g ? "bg-neutral-900 text-white" : conteggi[g] ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-neutral-100 text-neutral-500"}`}>
                  <span className="block text-sm">{Number(g.slice(8))}</span>
                  <span className={`block text-[10px] font-semibold ${scelto === g ? "text-white" : conteggi[g] ? "text-blue-800" : "text-transparent"}`}>{conteggi[g] ?? 0}</span>
                </button>
              ) : <span key={`v${j}`} />)}
            </div>
          ))}
          <p className="mt-1 text-[10px] text-neutral-500">Sotto ogni giorno: quanti task (lead con quella data), senza contare gli altri filtri.</p>
        </div>
      )}
    </div>
  );
}
