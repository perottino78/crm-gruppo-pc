"use client";

import { useEffect, useRef, useState } from "react";

const inp = "border border-neutral-300 rounded px-2 py-1 text-sm text-neutral-900 bg-white";
type Azione = (fd: FormData) => void | Promise<void>;

/**
 * Barra in fondo allo schermo che compare quando si spuntano righe del materiale (come in BConsole):
 * ordine al fornitore, sposta in un altro progetto, task a un ufficio, togli il materiale aggiunto.
 * Sta dentro il modulo della tabella: i pulsanti usano le righe spuntate.
 */
export default function BarraAzioniMateriale({ fornitori, progetti, uffici, puoOrdinare, azioni }: {
  fornitori: { id: string; ragioneSociale: string }[];
  progetti: { id: string; nome: string }[];
  uffici: { chiave: string; nome: string }[];
  puoOrdinare: boolean;
  azioni: { ordine: Azione; sposta: Azione; task: Azione; elimina: Azione };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const conta = () => setN(form.querySelectorAll<HTMLInputElement>('input[name="riga"]:checked').length);
    form.addEventListener("change", conta);
    conta();
    return () => form.removeEventListener("change", conta);
  }, []);
  const tutte = (v: boolean) => {
    const form = ref.current?.closest("form");
    form?.querySelectorAll<HTMLInputElement>('input[name="riga"]').forEach((c) => { c.checked = v; });
    form?.dispatchEvent(new Event("change"));
  };
  return (
    <div ref={ref}>
      <div className="flex gap-3 text-xs mt-1">
        <button type="button" onClick={() => tutte(true)} className="text-blue-800 underline">spunta tutte</button>
        <button type="button" onClick={() => tutte(false)} className="text-blue-800 underline">togli le spunte</button>
        {n === 0 && <span className="text-neutral-500">Spunta le righe: in fondo allo schermo compaiono le azioni.</span>}
      </div>
      {n > 0 && (
        <div className="sticky bottom-0 z-40 mt-2 -mx-3 rounded-t-lg bg-purple-900 text-white shadow-2xl px-3 py-2">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2 text-sm">
            <span className="font-bold self-center">{n} {n === 1 ? "riga spuntata" : "righe spuntate"}</span>
            {puoOrdinare && (
              <div className="flex items-end gap-1">
                <select name="fornitoreId" aria-label="Fornitore dell'ordine" className={`${inp} max-w-48`}>
                  <option value="">fornitore delle righe</option>
                  {fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
                </select>
                <button formAction={azioni.ordine} className="btn-3d btn-3d-purple text-xs px-3 py-1.5">📨 Ordine al fornitore</button>
              </div>
            )}
            {progetti.length > 0 && (
              <div className="flex items-end gap-1">
                <select name="progettoDestinazione" aria-label="Progetto di destinazione" className={`${inp} max-w-56`}>
                  <option value="">progetto…</option>
                  {progetti.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <button formAction={azioni.sposta} className="btn-3d btn-3d-amber text-xs px-3 py-1.5">📁 Sposta</button>
              </div>
            )}
            <div className="flex items-end gap-1">
              <select name="ufficioTask" aria-label="Ufficio del task" className={`${inp} max-w-40`}>
                <option value="">ufficio…</option>
                {uffici.map((u) => <option key={u.chiave} value={u.chiave}>{u.nome}</option>)}
              </select>
              <input name="titoloTask" placeholder="titolo (facoltativo)" className={`${inp} w-40`} />
              <button formAction={azioni.task} className="btn-3d btn-3d-teal text-xs px-3 py-1.5">✅ Crea task</button>
            </div>
            <button formAction={azioni.elimina} className="btn-3d btn-3d-red text-xs px-3 py-1.5">🗑 Togli</button>
            <button type="button" onClick={() => tutte(false)} className="ml-auto text-xs underline self-center">chiudi</button>
          </div>
        </div>
      )}
    </div>
  );
}
