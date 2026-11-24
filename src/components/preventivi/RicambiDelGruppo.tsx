"use client";

import { useEffect, useState } from "react";
import { aggiungiArticoloPreventivo } from "@/app/actions";
import { alMetro } from "@/lib/listini/ricambi-vetrate";

type Art = { id: string; codice: string; descrizione: string; descrizioneEstesa: string | null; immagineUrl: string | null; um: string; prezzoVendita: number | null; aliquotaIva: number; categoria: { nome: string } | null };

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
  const euro = (n: number | null) => (n === null ? "prezzo da definire" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean }));
  return (
    <>
    <section className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50/50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-amber-950">🔧 Ricambi e articoli {gruppo ? `di ${gruppo}` : `di ${famiglia.toLowerCase()}`} ({lista.length})</h3>
        {lista.length > 6 && <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca codice o descrizione" className="rounded border border-neutral-300 px-2 py-1 text-xs" />}
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {[...viste].sort((x, y) => (x.categoria?.nome ?? "").localeCompare(y.categoria?.nome ?? "") || x.descrizione.localeCompare(y.descrizione)).map((a, i, tutti) => (
          <li key={a.id} className="list-none">
          {(i === 0 || tutti[i - 1].categoria?.nome !== a.categoria?.nome) && a.categoria && (
            <h4 className="mb-1 mt-2 text-[11px] font-bold uppercase tracking-wide text-amber-900">{a.categoria.nome}</h4>
          )}
          <div className="rounded border border-amber-200 bg-white px-2 py-1.5">
            <form action={aggiungiArticoloPreventivo} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="preventivoId" value={preventivoId} />
              <input type="hidden" name="articoloId" value={a.id} />
              {sezioneId && <input type="hidden" name="sezioneId" value={sezioneId} />}
              {a.immagineUrl && !a.immagineUrl.startsWith("data:") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.immagineUrl} alt="" className="h-12 w-12 shrink-0 rounded border border-neutral-200 object-cover" />
              )}
              <span className="min-w-[14rem] flex-1 text-xs">
                <b className="font-mono">{a.codice}</b> {a.descrizione}
                {a.descrizioneEstesa && <span className="mt-0.5 block text-[11px] text-neutral-600">{a.descrizioneEstesa}</span>}
              </span>
              <span className="text-xs font-semibold text-neutral-800">{euro(a.prezzoVendita)}{alMetro(a.um) ? " /mt" : ""}</span>
              {alMetro(a.um)
                ? <label className="flex items-center gap-1 text-[11px] text-neutral-600"><input name="quantita" type="number" min={0.01} step={0.01} defaultValue={1} className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-xs" aria-label="Metri" />mt</label>
                : <input name="quantita" type="number" min={1} defaultValue={1} className="w-14 rounded border border-neutral-300 px-1.5 py-1 text-xs" aria-label="Quantità" />}
              <button className="btn-3d btn-3d-orange px-2.5 py-1 text-[11px]">🛒 Aggiungi</button>
            </form>
          </div>
          </li>
        ))}
        {viste.length === 0 && <li className="text-xs text-neutral-600">Nessun articolo trovato.</li>}
      </ul>
    </section>
    </>
  );
}
