"use client";

import { useState } from "react";
import { costoAlMinuto, costoLavoro, durataLeggibile, numeroIt } from "@/lib/pratica/costo-lavoro";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

/**
 * Riga sotto il passaggio fra uffici: quanto è costato l'operatore per quella fase.
 * Minuti × costo orario (diviso in minuti): il totale si calcola mentre si scrive e finisce nei costi della commessa.
 */
export default function CostoLavoroTask({ taskId, minuti, costoOrario, costoLavoroSalvato, lavoroDaNome, proposta, azione }: {
  taskId: string; minuti: number | null; costoOrario: number | null; costoLavoroSalvato: number; lavoroDaNome: string | null;
  proposta: number | null; azione: (fd: FormData) => void | Promise<void>;
}) {
  const [min, setMin] = useState(minuti ? String(minuti) : "");
  const [orario, setOrario] = useState(costoOrario !== null ? String(costoOrario).replace(".", ",") : proposta !== null ? String(proposta).replace(".", ",") : "");
  const m = numeroIt(min), o = numeroIt(orario);
  const totale = costoLavoro(m, o);
  const salvato = minuti !== null && costoLavoroSalvato > 0;
  const modificato = salvato ? (m !== minuti || o !== costoOrario) : (m ?? 0) > 0;
  const inp = "w-20 rounded border border-neutral-300 bg-white px-2 py-1 text-sm";
  return (
    <form action={azione} className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2">
      <input type="hidden" name="taskId" value={taskId} />
      <span className="self-center text-xs font-extrabold text-teal-900">⏱ Costo operatore</span>
      <label className="text-[11px] font-bold text-neutral-700">Minuti<input name="minuti" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} className={`${inp} block`} placeholder="es. 45" /></label>
      <label className="text-[11px] font-bold text-neutral-700">Costo orario €/h<input name="costoOrario" inputMode="decimal" value={orario} onChange={(e) => setOrario(e.target.value)} className={`${inp} block`} placeholder="es. 35" /></label>
      <div className="self-center text-xs text-neutral-700">
        {o && o > 0 ? <>= <b>{costoAlMinuto(o).toLocaleString("it-IT", { maximumFractionDigits: 2 })} €/min</b></> : <span className="text-neutral-500">scrivi il costo orario</span>}
        {totale > 0 && <> · {durataLeggibile(m ?? 0)} = <b className="text-base text-teal-900">{eur(totale)}</b></>}
      </div>
      <button disabled={!modificato} className="btn-3d btn-3d-teal px-3 py-1.5 text-xs disabled:opacity-40">{salvato ? "💾 Aggiorna" : "💾 Salva nei costi"}</button>
      {salvato && !modificato && <span className="self-center text-[11px] font-semibold text-green-800">✓ nei costi della commessa{lavoroDaNome ? ` (inserito da ${lavoroDaNome})` : ""}</span>}
    </form>
  );
}
