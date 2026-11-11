"use client";

// Riga di solo testo dell'offerta (con o senza importo): a destra «modifica», «duplica», «elimina» come le righe prodotto.
import { useState } from "react";
import { duplicaRigaPreventivo, modificaRigaPreventivo, rimuoviRigaPreventivo } from "@/app/actions";

export default function RigaTesto({ rigaId, preventivoId, testo, importo }: { rigaId: string; preventivoId: string; testo: string; importo: number }) {
  const [modifica, setModifica] = useState(false);
  const eur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="flex-1 font-medium text-neutral-800 whitespace-pre-line">📝 {testo}</p>
        <div className="flex items-start gap-3 shrink-0">
          {importo !== 0 && <span className={`font-medium pt-1 ${importo < 0 ? "text-red-600" : ""}`}>{eur(importo)}</span>}
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
          <input name="prezzoUnitario" inputMode="decimal" defaultValue={importo ? String(importo).replace(".", ",") : ""} placeholder="Importo €" className="w-28 text-sm border border-neutral-300 rounded px-2 py-1.5" />
          <button className="btn-3d btn-3d-blue text-xs px-3 py-1.5">✓ Fatto</button>
          <button type="button" onClick={() => setModifica(false)} className="text-xs text-neutral-600 underline self-center">annulla</button>
        </form>
      )}
    </div>
  );
}
