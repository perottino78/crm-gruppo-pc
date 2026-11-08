"use client";

import { useState } from "react";
import { caricaRilievo } from "@/app/commesse-actions";
import FotoRilievo from "@/components/FotoRilievo";
import ScegliMateriale, { type MaterialeInLista } from "./ScegliMateriale";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

/**
 * Modulo unico del rilievo, come «carica rilievo» di BConsole: misure, foto e PDF, il materiale dell'offerta
 * (quello del commerciale) e il materiale mancante da aggiungere. Un solo «Salva» registra tutto.
 */
export default function CaricaRilievo({ rilievoId, misure, eseguito, materialeOfferta, fornitori }: {
  rilievoId: string; misure: string; eseguito: boolean;
  materialeOfferta: { descrizione: string; quantita: number; complemento: boolean; fornitore: string | null }[];
  fornitori: { id: string; ragioneSociale: string }[];
}) {
  const [lista, setLista] = useState<MaterialeInLista[]>([]);
  return (
    <form action={caricaRilievo} className="mt-2 space-y-3">
      <input type="hidden" name="rilievoId" value={rilievoId} />
      <input type="hidden" name="complementi" value={JSON.stringify(lista.map(({ etichetta: _e, ...x }) => x))} />
      <div>
        <p className="text-xs font-bold text-neutral-800 mb-1">1 · Misure e note di cantiere</p>
        <textarea name="misure" rows={6} defaultValue={misure} placeholder={"Misure per ogni apertura/elemento, es.\nSoggiorno – finestra 2 ante: L 1200 × H 1400 …"} className={`${inp} w-full`} />
      </div>
      <div>
        <p className="text-xs font-bold text-neutral-800 mb-1">2 · Rilievo cartaceo (PDF) e foto</p>
        <FotoRilievo name="foto" pdf />
      </div>
      <div>
        <p className="text-xs font-bold text-neutral-800 mb-1">3 · Materiale</p>
        <div className="rounded border border-neutral-200 bg-white">
          <p className="text-[11px] font-bold text-neutral-600 px-2 pt-1.5">GIÀ NELLA PRATICA (offerta del commerciale{materialeOfferta.some((m) => m.complemento) ? " e materiale già aggiunto" : ""})</p>
          {materialeOfferta.length ? (
            <ul className="divide-y divide-neutral-100 text-sm">
              {materialeOfferta.map((m, i) => (
                <li key={i} className="px-2 py-1 flex flex-wrap gap-x-3">
                  <span>{m.complemento && "🧩 "}{m.descrizione}</span><span className="text-xs text-neutral-600">× {m.quantita}</span>
                  {m.fornitore && <span className="text-xs text-neutral-500">{m.fornitore}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="px-2 py-1 text-xs text-neutral-500">Nessuna riga nell&apos;offerta.</p>}
          <p className="text-[11px] font-bold text-teal-800 px-2 pt-2">DA AGGIUNGERE (solo acquisto: la vendita al cliente non cambia)</p>
          {lista.length ? (
            <ul className="divide-y divide-neutral-100 text-sm">
              {lista.map((m, i) => (
                <li key={i} className="px-2 py-1 flex flex-wrap items-center gap-x-3">
                  <span>🧩 {m.etichetta}</span>{m.note && <span className="text-xs text-neutral-600">({m.note})</span>}
                  <button type="button" onClick={() => setLista(lista.filter((_, j) => j !== i))} className="text-xs text-red-700 underline">togli</button>
                </li>
              ))}
            </ul>
          ) : <p className="px-2 py-1 text-xs text-neutral-500">Niente da aggiungere per ora.</p>}
          <div className="p-2"><ScegliMateriale fornitori={fornitori} onAggiungi={(m) => setLista([...lista, m])} /></div>
        </div>
      </div>
      <button className="btn-3d btn-3d-green text-sm px-5 py-2">💾 Salva il rilievo{lista.length ? ` e ${lista.length} material${lista.length === 1 ? "e" : "i"}` : ""}</button>
      {!eseguito && <p className="text-[11px] text-neutral-500">Il rilievo risulterà eseguito; il materiale va nell&apos;elenco dell&apos;ufficio ordini («4 · Evasione ordini»).</p>}
    </form>
  );
}
