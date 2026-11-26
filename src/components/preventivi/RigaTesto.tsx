"use client";

// Riga di solo testo dell'offerta (con o senza importo): a destra «modifica», «duplica», «elimina» come le righe prodotto.
import { useState } from "react";
import { duplicaRigaPreventivo, modificaRigaPreventivo, rimuoviRigaPreventivo } from "@/app/actions";

// Quantità e prezzo unitario modificabili come le righe prodotto (Ugo 25/11/2026: accessori e articoli).
export default function RigaTesto({ rigaId, preventivoId, testo, quantita, prezzoUnitario }: { rigaId: string; preventivoId: string; testo: string; quantita: number; prezzoUnitario: number }) {
  const importo = quantita * prezzoUnitario;
  const num = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 2, useGrouping: false });
  const [modifica, setModifica] = useState(false);
  const eur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="flex-1 font-medium text-neutral-800 whitespace-pre-line">📝 {testo}</p>
        <div className="flex items-start gap-3 shrink-0">
          {importo !== 0 && (
            <span className={`font-medium pt-1 text-right ${importo < 0 ? "text-red-600" : ""}`}>
              {eur(importo)}
              {quantita > 1 && <span className="block text-[11px] font-normal text-neutral-500">{quantita} × {eur(prezzoUnitario)}</span>}
            </span>
          )}
          <div className="flex flex-col gap-1 w-[84px] shrink-0">
            <button type="button" onClick={() => setModifica((v) => !v)} className="btn-flat btn-flat-neutral w-full">✏️ modifica</button>
            <form action={duplicaRigaPreventivo}>
              <input type="hidden" name="id" value={rigaId} />
              <input type="hidden" name="preventivoId" value={preventivoId} />
              <button className="btn-flat btn-flat-green w-full">⧉ duplica</button>
            </form>
            <form action={rimuoviRigaPreventivo}>
              <input type="hidden" name="id" value={rigaId} />
              <input type="hidden" name="preventivoId" value={preventivoId} />
              <button className="btn-flat btn-flat-red w-full">🗑 elimina</button>
            </form>
          </div>
        </div>
      </div>
      {modifica && (
        <form action={async (fd) => { await modificaRigaPreventivo(fd); setModifica(false); }} className="mt-2 flex flex-wrap items-start gap-2">
          <input type="hidden" name="id" value={rigaId} />
          <input type="hidden" name="preventivoId" value={preventivoId} />
          <textarea name="testoLibero" required rows={2} defaultValue={testo} autoFocus className="flex-1 min-w-[220px] text-sm border border-neutral-300 rounded px-2 py-1.5" />
          <label className="flex flex-col text-[11px] text-neutral-600">Quantità
            <input name="quantita" type="number" min={1} step={1} defaultValue={quantita} className="w-20 text-sm border border-neutral-300 rounded px-2 py-1.5" />
          </label>
          <label className="flex flex-col text-[11px] text-neutral-600">Prezzo unitario €
            <input name="prezzoUnitario" inputMode="decimal" defaultValue={prezzoUnitario ? num(prezzoUnitario) : ""} placeholder="0,00" className="w-28 text-sm border border-neutral-300 rounded px-2 py-1.5" />
          </label>
          <button className="btn-3d btn-3d-blue text-xs px-3 py-1.5 self-end">✓ Fatto</button>
          <button type="button" onClick={() => setModifica(false)} className="text-xs text-neutral-600 underline self-end pb-1.5">annulla</button>
        </form>
      )}
    </div>
  );
}
