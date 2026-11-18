"use client";

import { useEffect, useState } from "react";

type Trovato = { id: string; codice: string; descrizione: string; um: string; costoAcquisto: number | null; prezzoVendita: number | null };
const eur = (n: number | null) => (n === null ? "—" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR" }));

/** Cerca un articolo e lo aggiunge (al kit con la quantità, oppure come correlato) con l'azione ricevuta. */
export default function AggiungiArticolo({ azione, articoloId, conQuantita, bottone }: { azione: (fd: FormData) => Promise<void>; articoloId: string; conQuantita?: boolean; bottone: string }) {
  const [q, setQ] = useState("");
  const [trovati, setTrovati] = useState<Trovato[]>([]);
  const [scelto, setScelto] = useState<Trovato | null>(null);
  useEffect(() => {
    if (scelto || q.trim().length < 2) { setTrovati([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/articoli/cerca?q=${encodeURIComponent(q)}`);
      setTrovati(r.ok ? (await r.json()).articoli : []);
    }, 300);
    return () => clearTimeout(t);
  }, [q, scelto]);
  const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";
  return (
    <form action={azione} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="articoloId" value={articoloId} />
      <input type="hidden" name="componenteId" value={scelto?.id ?? ""} />
      <div className="relative">
        <label className="text-xs font-bold text-neutral-800 block">Cerca un articolo (codice o nome)</label>
        {scelto ? (
          <div className={`${inp} bg-blue-50 flex items-center gap-2`}><span className="font-semibold">{scelto.codice} — {scelto.descrizione}</span><button type="button" onClick={() => { setScelto(null); setQ(""); }} className="text-xs underline text-blue-800">cambia</button></div>
        ) : (
          <input value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" placeholder="es. guarnizione, vite, ART-00012…" className={`${inp} w-80`} />
        )}
        {trovati.length > 0 && (
          <ul className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-auto bg-white border border-neutral-300 rounded shadow-lg text-sm">
            {trovati.map((a) => (
              <li key={a.id}><button type="button" onClick={() => { setScelto(a); setTrovati([]); }} className="w-full text-left px-2 py-1.5 hover:bg-blue-50">
                <span className="font-mono text-xs text-neutral-500">{a.codice}</span> {a.descrizione} <span className="text-xs text-neutral-500">· costo {eur(a.costoAcquisto)} · vendita {eur(a.prezzoVendita)}/{a.um}</span>
              </button></li>
            ))}
          </ul>
        )}
      </div>
      {conQuantita && <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">Quantità<input name="quantita" defaultValue="1" inputMode="decimal" className={`${inp} w-20`} /></label>}
      <button disabled={!scelto} className="btn-3d btn-3d-teal text-sm px-3 py-1.5 disabled:opacity-50">{bottone}</button>
    </form>
  );
}
