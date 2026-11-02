"use client";

import { useState } from "react";
import { firmaHtml } from "@/lib/mail/firma";
import { salvaFirma } from "@/app/offerte-email-actions";

/** Firma email di un utente: si scrive a righe (o si incolla in HTML), anteprima com'è nell'email. */
export default function EditorFirma({ utenteId, firma, predefinita, colore, torna, salvata, compatto }: {
  utenteId: string; firma: string | null; predefinita: string; colore?: string; torna: string; salvata?: boolean; compatto?: boolean;
}) {
  const [testo, setTesto] = useState(firma ?? predefinita);
  const html = firmaHtml(testo, { colore });
  return (
    <form action={salvaFirma} className={`grid gap-3 ${compatto ? "" : "md:grid-cols-2"}`}>
      <input type="hidden" name="utenteId" value={utenteId} />
      <input type="hidden" name="torna" value={torna} />
      <div className="flex flex-col gap-2">
        <textarea name="firma" value={testo} onChange={(e) => setTesto(e.target.value)} rows={8}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs" aria-label="Testo della firma" />
        <p className="text-xs text-neutral-500">
          Una riga per volta: nome, ruolo, telefono, email, sito… La prima riga esce in grassetto. Email, telefoni e siti diventano cliccabili.
          Hai già una firma fatta (es. da Outlook)? Incollala in HTML.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-3d btn-3d-green text-xs px-3 py-1.5">💾 Salva firma</button>
          <button type="button" onClick={() => setTesto(predefinita)} className="btn-3d btn-3d-outline text-xs px-3 py-1.5" title="Riparte dai dati della scheda: nome, ruolo, telefono, email">↺ Firma pronta</button>
          {!firma && <span className="text-xs text-neutral-500">ora si usa la firma pronta</span>}
          {salvata && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">✓ Salvata</span>}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-neutral-600">Anteprima</p>
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white p-3" dangerouslySetInnerHTML={{ __html: html || "<span style='color:#a3a3a3'>nessuna firma</span>" }} />
      </div>
    </form>
  );
}
