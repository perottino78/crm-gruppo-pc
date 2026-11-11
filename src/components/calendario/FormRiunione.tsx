"use client";

// Riunione interna (richiesta di Rocco): al posto del cliente si scelgono una o più persone del team; niente «tipo» e niente
// conferma al cliente: l'invito parte da solo a tutti i partecipanti.
import { useState } from "react";
import { creaRiunione } from "@/app/calendario-actions";

const inp = "w-full border border-neutral-300 rounded px-2 py-1.5 text-sm";
const lab = "text-[11px] font-bold text-neutral-700";

export default function FormRiunione({ utenti, data, io, ritorno }: { utenti: { id: string; nome: string }[]; data: string; io: string; ritorno: string }) {
  const [scelti, setScelti] = useState<string[]>([io]);
  const cambia = (id: string) => setScelti((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <form action={creaRiunione} className="grid grid-cols-1 gap-3 md:grid-cols-6">
      <input type="hidden" name="ritorno" value={ritorno} />
      <div className="md:col-span-6">
        <label className={lab}>Chi partecipa * <span className="font-normal text-neutral-500">({scelti.length} {scelti.length === 1 ? "persona" : "persone"})</span></label>
        <div className="mt-1 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded border border-neutral-200 p-2">
          {utenti.map((u) => (
            <label key={u.id} className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-semibold ${scelti.includes(u.id) ? "border-blue-700 bg-blue-700 text-white" : "border-neutral-300 bg-white text-neutral-800"}`}>
              <input type="checkbox" name="partecipanti" value={u.id} checked={scelti.includes(u.id)} onChange={() => cambia(u.id)} className="sr-only" />
              {u.nome}
            </label>
          ))}
        </div>
      </div>
      <div className="md:col-span-3">
        <label className={lab}>Titolo *</label>
        <input name="titolo" required placeholder="es. Riunione commerciale del lunedì" className={inp} />
      </div>
      <div className="md:col-span-2">
        <label className={lab}>Giorno e ora *</label>
        <input type="datetime-local" name="dataOra" defaultValue={data} step={900} required className={inp} />
      </div>
      <div className="md:col-span-1">
        <label className={lab}>Durata</label>
        <select name="durataMin" defaultValue="60" className={inp}>
          {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} ${m === 60 ? "ora" : "ore"}`}</option>)}
        </select>
      </div>
      <div className="md:col-span-6">
        <label className={lab}>Luogo</label>
        <input name="luogo" placeholder="es. sala riunioni Rosta, oppure link della videochiamata" className={inp} />
      </div>
      <div className="md:col-span-6">
        <label className={lab}>Note / ordine del giorno</label>
        <textarea name="note" rows={2} className={inp} />
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-6">
        <span className="text-[11px] text-neutral-600">📨 L&apos;invito parte da solo a tutti i partecipanti (sul calendario del telefono).</span>
        <button disabled={!scelti.length} className="btn-3d btn-3d-blue ml-auto px-5 py-2 text-sm disabled:opacity-50">👥 Fissa la riunione</button>
      </div>
    </form>
  );
}
