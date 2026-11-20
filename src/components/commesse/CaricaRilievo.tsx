"use client";

import { useState } from "react";
import { caricaRilievo } from "@/app/commesse-actions";
import FotoRilievo from "@/components/FotoRilievo";
import ScegliMateriale, { etichettaMateriale, type MaterialeInLista } from "./ScegliMateriale";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

/**
 * Modulo unico del rilievo, come «carica rilievo» di BConsole: misure, foto e PDF, il materiale dell'offerta
 * (quello del commerciale) e il materiale mancante da aggiungere. Un solo «Salva» registra tutto.
 */
export default function CaricaRilievo({ rilievoId, misure, eseguito, materialeOfferta, fornitori, brandId }: {
  brandId?: string; rilievoId: string; misure: string; eseguito: boolean;
  materialeOfferta: { descrizione: string; quantita: number; complemento: boolean; fornitore: string | null }[];
  fornitori: { id: string; ragioneSociale: string }[];
}) {
  const [lista, setLista] = useState<MaterialeInLista[]>([]);
  // riga in modifica (indice) e valori che si stanno scrivendo
  const [inModifica, setInModifica] = useState<number | null>(null);
  const [bozza, setBozza] = useState<{ quantita: string; fornitoreId: string; note: string; descrizione: string }>({ quantita: "1", fornitoreId: "", note: "", descrizione: "" });
  function apriModifica(i: number) {
    const m = lista[i];
    setBozza({ quantita: String(m.quantita ?? 1), fornitoreId: m.fornitoreId ?? "", note: m.note ?? "", descrizione: m.tipo === "T" ? (m.descrizione ?? "") : "" });
    setInModifica(i);
  }
  function salvaModifica() {
    if (inModifica === null) return;
    setLista(lista.map((m, j) => {
      if (j !== inModifica) return m;
      const nuovo: MaterialeInLista = { ...m, quantita: bozza.quantita.trim() || "1", fornitoreId: bozza.fornitoreId || null, note: bozza.note.trim() || null };
      if (m.tipo === "T" && bozza.descrizione.trim()) { nuovo.descrizione = bozza.descrizione.trim(); nuovo.base = bozza.descrizione.trim(); }
      return { ...nuovo, etichetta: etichettaMateriale(nuovo, fornitori) };
    }));
    setInModifica(null);
  }
  /** Una copia subito sotto, da correggere (misura, quantità…). La foto/PDF allegato non si copia: pesa e va nei documenti una volta sola. */
  function duplica(i: number) {
    const { allegato: _a, ...copia } = lista[i];
    const nuova: MaterialeInLista = { ...copia, fuori: null };
    setLista([...lista.slice(0, i + 1), { ...nuova, etichetta: etichettaMateriale(nuova, fornitori) }, ...lista.slice(i + 1)]);
    setInModifica(null);
  }
  return (
    <form action={caricaRilievo} className="mt-2 space-y-3">
      <input type="hidden" name="rilievoId" value={rilievoId} />
      <input type="hidden" name="complementi" value={JSON.stringify(lista.map(({ etichetta: _e, base: _b, fornDefault: _f, fuori: _u, ...x }) => x))} />
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
                <li key={i} className="px-2 py-1">
                  <div className="flex flex-wrap items-center gap-x-3">
                    <span>🧩 {m.etichetta}</span>{m.note && <span className="text-xs text-neutral-600">({m.note})</span>}
                    <button type="button" onClick={() => (inModifica === i ? setInModifica(null) : apriModifica(i))} className="text-xs text-blue-800 underline">{inModifica === i ? "annulla modifica" : "modifica"}</button>
                    <button type="button" onClick={() => duplica(i)} className="text-xs text-teal-800 underline" title="Mette una copia subito sotto, da correggere">duplica</button>
                    <button type="button" onClick={() => { setLista(lista.filter((_, j) => j !== i)); setInModifica(null); }} className="text-xs text-red-700 underline">togli</button>
                  </div>
                  {inModifica === i && (
                    <div className="mt-1 flex flex-wrap items-end gap-2 rounded border border-blue-200 bg-blue-50/60 p-2">
                      {m.tipo === "T" && <label className="flex flex-col gap-1 text-xs font-bold text-neutral-800">Descrizione<input value={bozza.descrizione} onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })} className={`${inp} w-64`} /></label>}
                      <label className="flex flex-col gap-1 text-xs font-bold text-neutral-800">Quantità<input value={bozza.quantita} onChange={(e) => setBozza({ ...bozza, quantita: e.target.value })} inputMode="numeric" className={`${inp} w-20`} /></label>
                      <label className="flex flex-col gap-1 text-xs font-bold text-neutral-800">Fornitore
                        <select value={bozza.fornitoreId} onChange={(e) => setBozza({ ...bozza, fornitoreId: e.target.value })} className={`${inp} max-w-60`}>
                          <option value="">{m.fornDefault ? `quello del listino (${m.fornDefault})` : "da scegliere…"}</option>
                          {fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-bold text-neutral-800">Note<input value={bozza.note} onChange={(e) => setBozza({ ...bozza, note: e.target.value })} className={`${inp} w-56`} /></label>
                      <button type="button" onClick={salvaModifica} className="btn-3d btn-3d-teal text-sm px-3 py-1.5">✓ Salva la modifica</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="px-2 py-1 text-xs text-neutral-500">Niente da aggiungere per ora.</p>}
          <div className="p-2"><ScegliMateriale brandId={brandId} fornitori={fornitori} onAggiungi={(m) => setLista([...lista, m])} /></div>
        </div>
      </div>
      <button className="btn-3d btn-3d-green text-sm px-5 py-2">💾 Salva il rilievo{lista.length ? ` e ${lista.length} material${lista.length === 1 ? "e" : "i"}` : ""}</button>
      {!eseguito && <p className="text-[11px] text-neutral-500">Il rilievo risulterà eseguito; il materiale va nell&apos;elenco dell&apos;ufficio ordini («4 · Evasione ordini»).</p>}
    </form>
  );
}
