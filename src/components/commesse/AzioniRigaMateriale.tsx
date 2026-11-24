"use client";

import { useRef, useState } from "react";

type Azione = (fd: FormData) => void | Promise<void>;

/**
 * Modifica, duplica ed elimina di una riga di materiale aggiunta a mano (Ugo 22/11/2026). Sta dentro il modulo con le spunte:
 * i pulsanti usano formAction e Invio nei campi salva la riga invece di creare l'ordine.
 */
export default function AzioniRigaMateriale({ rigaId, descrizione, quantita, note, azioni }: {
  rigaId: string; descrizione: string; quantita: number; note: string | null;
  azioni: { modifica: Azione; duplica: Azione; elimina: Azione };
}) {
  const [aperto, setAperto] = useState(false);
  const salva = useRef<HTMLButtonElement>(null);
  const campo = "border border-neutral-300 rounded px-1.5 py-1 text-xs bg-white";
  const invio = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); salva.current?.click(); } };
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2 text-xs">
        <button type="button" onClick={() => setAperto(!aperto)} className="text-blue-800 underline">✏️ modifica</button>
        <button formAction={azioni.duplica} className="text-neutral-800 underline">⧉ duplica</button>
        <button formAction={azioni.elimina} className="text-red-700 underline" onClick={(e) => { if (!confirm("Togliere questa riga dal materiale?")) e.preventDefault(); }}>🗑 elimina</button>
      </div>
      {aperto && (
        <div className="w-72 rounded border border-blue-200 bg-blue-50 p-2 space-y-1 text-left">
          <input name={`desc_${rigaId}`} defaultValue={descrizione} onKeyDown={invio} className={`${campo} w-full`} aria-label="Descrizione" />
          <div className="flex gap-1">
            <input name={`qta_${rigaId}`} type="number" min={1} defaultValue={quantita} onKeyDown={invio} className={`${campo} w-16`} aria-label="Quantità" title="Quantità" />
            <input name={`note_${rigaId}`} defaultValue={note ?? ""} onKeyDown={invio} placeholder="nota" className={`${campo} flex-1`} aria-label="Nota" />
          </div>
          <button ref={salva} formAction={azioni.modifica} className="btn-3d btn-3d-blue text-xs px-3 py-1">💾 Salva</button>
        </div>
      )}
    </div>
  );
}
