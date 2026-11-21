"use client";

import { useState, useTransition } from "react";

/**
 * Tendina del fornitore su ogni riga del materiale ancora da ordinare: si cambia al volo (si salva da sola).
 * Non usa un modulo: sta dentro quello della tabella con le spunte.
 */
export default function FornitoreRiga({ rigaId, fornitoreId, fornitori, azione }: {
  rigaId: string;
  fornitoreId: string | null;
  fornitori: { id: string; ragioneSociale: string }[];
  azione: (rigaId: string, fornitoreId: string) => Promise<void>;
}) {
  const [valore, setValore] = useState(fornitoreId ?? "");
  const [attesa, avvia] = useTransition();
  return (
    <select
      value={valore}
      disabled={attesa}
      aria-label="Fornitore della riga"
      title="Cambia il fornitore di questa riga"
      onChange={(e) => {
        const nuovo = e.target.value;
        setValore(nuovo);
        avvia(async () => { await azione(rigaId, nuovo); });
      }}
      className={`border rounded px-1 py-0.5 text-xs bg-white max-w-44 ${valore ? "border-neutral-300 text-neutral-900" : "border-amber-400 text-amber-900"}`}
    >
      <option value="">da scegliere</option>
      {fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
    </select>
  );
}
