"use client";

import { useState } from "react";
import { caricaRilievo } from "@/app/commesse-actions";
import FotoRilievo from "@/components/FotoRilievo";
import ScegliMateriale, { etichettaMateriale, type MaterialeInLista } from "./ScegliMateriale";
import VerbaleCompilazione from "./VerbaleCompilazione";
import type { Verbale } from "@/lib/rilievo/verbale";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

/**
 * Modulo unico del rilievo, come «carica rilievo» di BConsole: misure, foto e PDF, il materiale dell'offerta
 * (quello del commerciale) e il materiale mancante da aggiungere. Un solo «Salva» registra tutto.
 */
export default function CaricaRilievo({ rilievoId, misure, eseguito, materialeOfferta, fornitori, brandId, verbale }: {
  verbale: Verbale; brandId?: string; rilievoId: string; misure: string; eseguito: boolean;
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
  const [passo, setPasso] = useState(1);
  const PASSI = [
    { n: 1, nome: "Prodotti", icona: "📦" },
    { n: 2, nome: "Verbale", icona: "📋" },
    { n: 3, nome: "Misure e file", icona: "📏" },
    { n: 4, nome: "Salva", icona: "✅" },
  ];
  const vai = (n: number) => { setPasso(Math.min(4, Math.max(1, n))); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };
  const pannello = (n: number) => (passo === n ? "" : "hidden");
  return (
    <form action={caricaRilievo} className="mt-2 space-y-3">
      <input type="hidden" name="rilievoId" value={rilievoId} />
      <input type="hidden" name="complementi" value={JSON.stringify(lista.map(({ etichetta: _e, base: _b, fornDefault: _f, fuori: _u, ...x }) => x))} />

      {/* passi: si vede solo quello che serve in quel momento */}
      <ol className="flex flex-wrap gap-1.5" aria-label="Passi del rilievo">
        {PASSI.map((p) => (
          <li key={p.n}>
            <button type="button" onClick={() => vai(p.n)} aria-current={passo === p.n ? "step" : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${passo === p.n ? "border-blue-600 bg-blue-600 text-white" : passo > p.n ? "border-green-400 bg-green-50 text-green-900" : "border-neutral-300 bg-white text-neutral-700"}`}>
              {passo > p.n ? "✓" : p.icona} {p.n}. {p.nome}
            </button>
          </li>
        ))}
      </ol>

      <section className={pannello(1)}>
        <h3 className="mb-1 text-base font-bold text-neutral-900">📦 Prodotti venduti e da aggiungere</h3>
        <p className="mb-2 text-xs text-neutral-600">A sinistra quello che ha venduto il commerciale; sotto aggiungi quello che serve per finire il lavoro (solo acquisto: la vendita al cliente non cambia).</p>
        <div className="rounded border border-neutral-200 bg-white">
          <p className="text-[11px] font-bold text-neutral-600 px-2 pt-1.5">VENDUTO (offerta del commerciale{materialeOfferta.some((m) => m.complemento) ? " e materiale già aggiunto" : ""})</p>
          {materialeOfferta.length ? (
            <ul className="divide-y divide-neutral-100 text-sm">
              {materialeOfferta.map((m, i) => (
                <li key={i} className="px-2 py-1.5 flex flex-wrap gap-x-3">
                  <span>{m.complemento && "🧩 "}{m.descrizione}</span><span className="text-xs text-neutral-600">× {m.quantita}</span>
                  {m.fornitore && <span className="text-xs text-neutral-500">{m.fornitore}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="px-2 py-1 text-xs text-neutral-500">Nessuna riga nell&apos;offerta.</p>}
          <p className="text-[11px] font-bold text-teal-800 px-2 pt-2">DA AGGIUNGERE (solo acquisto)</p>
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
      </section>

      <section className={pannello(2)}>
        <h3 className="mb-1 text-base font-bold text-neutral-900">📋 Verbale di sopralluogo</h3>
        <p className="mb-2 text-xs text-neutral-600">Apri una sezione, spunta quello che vedi e chiudila. È il verbale che serve per il piano di lavorazione e la posa; si stampa insieme al rilievo.</p>
        <VerbaleCompilazione iniziale={verbale} />
      </section>

      <section className={pannello(3)}>
        <h3 className="mb-1 text-base font-bold text-neutral-900">📏 Misure, rilievo cartaceo e foto</h3>
        <label className="block text-xs font-bold text-neutral-800 mb-1">Misure e note di cantiere</label>
        <textarea name="misure" rows={7} defaultValue={misure} placeholder={"Misure per ogni apertura/elemento, es.\nSoggiorno – finestra 2 ante: L 1200 × H 1400 …"} className={`${inp} w-full`} />
        <p className="text-xs font-bold text-neutral-800 mt-3 mb-1">Rilievo cartaceo (PDF) e foto</p>
        <FotoRilievo name="foto" pdf />
        <p className="mt-1 text-[11px] text-neutral-600">I file caricati qui vanno anche nelle cartelle della pratica: i PDF in «Rilievi misura», le foto in «Foto rilievi».</p>
      </section>

      <section className={pannello(4)}>
        <h3 className="mb-1 text-base font-bold text-neutral-900">✅ Salva il rilievo</h3>
        <ul className="mb-3 space-y-1 text-sm text-neutral-800">
          <li>📦 Materiale da aggiungere: <b>{lista.length}</b></li>
          <li>📋 Verbale e 📏 misure: si salvano così come li hai compilati (puoi tornare indietro a controllarli).</li>
        </ul>
        <button className="btn-3d btn-3d-green text-base px-6 py-2.5">💾 Salva il rilievo{lista.length ? ` e ${lista.length} material${lista.length === 1 ? "e" : "i"}` : ""}</button>
        {!eseguito && <p className="mt-2 text-[11px] text-neutral-500">Il rilievo risulterà eseguito; il materiale va nell&apos;elenco dell&apos;ufficio ordini. Dopo il salvataggio puoi stampare il verbale insieme al rilievo.</p>}
      </section>

      <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
        <button type="button" onClick={() => vai(passo - 1)} disabled={passo === 1} className="btn-3d btn-3d-outline text-sm px-4 py-2 disabled:opacity-40">← Indietro</button>
        <span className="text-xs text-neutral-500">Passo {passo} di 4</span>
        <button type="button" onClick={() => vai(passo + 1)} disabled={passo === 4} className="btn-3d btn-3d-blue text-sm px-4 py-2 disabled:opacity-40">Avanti →</button>
      </div>
    </form>
  );
}
