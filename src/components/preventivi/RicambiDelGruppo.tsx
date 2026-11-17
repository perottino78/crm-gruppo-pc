"use client";

import { useEffect, useState } from "react";
import { aggiungiArticoloPreventivo } from "@/app/actions";

type Art = { id: string; codice: string; descrizione: string; um: string; prezzoVendita: number | null; aliquotaIva: number; categoria: { nome: string } | null };

/** Articoli dell'anagrafica (ricambi…) collegati a questa famiglia/gruppo del listino: si aggiungono all'offerta come righe con il loro prezzo (richiesta di Ugo, 18/11/2026). */
export default function RicambiDelGruppo({ famiglia, gruppo, preventivoId, sezioneId }: { famiglia: string; gruppo: string | null; preventivoId: string; sezioneId: string | null }) {
  const [lista, setLista] = useState<Art[] | null>(null);
  const [cerca, setCerca] = useState("");
  useEffect(() => {
    let vivo = true;
    setLista(null);
    fetch(`/api/articoli/listino?famiglia=${encodeURIComponent(famiglia)}${gruppo ? `&gruppo=${encodeURIComponent(gruppo)}` : ""}`)
      .then((r) => (r.ok ? r.json() : { articoli: [] })).then((j) => { if (vivo) setLista(j.articoli ?? []); }).catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [famiglia, gruppo]);
  if (!lista || lista.length === 0) return null;
  const parole = cerca.toLowerCase().split(/\s+/).filter(Boolean);
  const viste = lista.filter((a) => parole.every((p) => `${a.codice} ${a.descrizione} ${a.categoria?.nome ?? ""}`.toLowerCase().includes(p)));
  const euro = (n: number | null) => (n === null ? "prezzo da definire" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
  return (
    <section className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50/50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-amber-950">🔧 Ricambi e articoli {gruppo ? `di ${gruppo}` : `di ${famiglia.toLowerCase()}`} ({lista.length})</h3>
        {lista.length > 6 && <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca codice o descrizione" className="rounded border border-neutral-300 px-2 py-1 text-xs" />}
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {viste.map((a) => (
          <li key={a.id} className="rounded border border-amber-200 bg-white px-2 py-1.5">
            <form action={aggiungiArticoloPreventivo} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="preventivoId" value={preventivoId} />
              <input type="hidden" name="articoloId" value={a.id} />
              {sezioneId && <input type="hidden" name="sezioneId" value={sezioneId} />}
              <span className="min-w-[14rem] flex-1 text-xs"><b className="font-mono">{a.codice}</b> {a.descrizione}{a.categoria && <span className="text-neutral-500"> · {a.categoria.nome}</span>}</span>
              <span className="text-xs font-semibold text-neutral-800">{euro(a.prezzoVendita)}</span>
              <input name="quantita" type="number" min={1} defaultValue={1} className="w-14 rounded border border-neutral-300 px-1.5 py-1 text-xs" />
              <button className="btn-3d btn-3d-orange px-2.5 py-1 text-[11px]">🛒 Aggiungi</button>
            </form>
          </li>
        ))}
        {viste.length === 0 && <li className="text-xs text-neutral-600">Nessun articolo trovato.</li>}
      </ul>
    </section>
  );
}
