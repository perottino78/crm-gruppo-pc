"use client";

// Riga «nuova» in fondo a ogni sezione (stanza) dell'offerta — richiesta di Rocco: due pulsanti, «Prodotto» o «Testo».
// «Testo» apre al posto dei pulsanti il testo + l'importo + «Aggiungi»; aggiunta la riga, tornano i due pulsanti pronti
// per la successiva. «Prodotto» apre la finestra «negozio» (SelettoreProdotto) già su questa sezione.
import { useState } from "react";
import { aggiungiRigaTestoLibero } from "@/app/actions";

export default function AggiungiRiga({ preventivoId, sezioneId, nomeSezione }: { preventivoId: string; sezioneId: string | null; nomeSezione?: string }) {
  const [testo, setTesto] = useState(false);
  const dove = nomeSezione ? ` in «${nomeSezione}»` : "";
  if (!testo) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-neutral-50/60">
        <span className="text-xs text-neutral-500">Nuova riga{dove}:</span>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("scegli-prodotto", { detail: { sezioneId } }))}
          className="btn-3d btn-3d-blue text-xs px-3 py-1.5"
        >
          🧩 Prodotto
        </button>
        <button type="button" onClick={() => setTesto(true)} className="btn-3d btn-3d-outline text-xs px-3 py-1.5">📝 Testo</button>
      </div>
    );
  }
  return (
    <form
      action={async (fd) => { await aggiungiRigaTestoLibero(fd); setTesto(false); }}
      className="flex flex-wrap items-start gap-2 px-4 py-2.5 bg-blue-50/50"
    >
      <input type="hidden" name="preventivoId" value={preventivoId} />
      {sezioneId && <input type="hidden" name="sezioneId" value={sezioneId} />}
      <textarea name="testoLibero" required autoFocus rows={2} placeholder={`Testo della riga${dove} (es. smontaggio e smaltimento dei vecchi serramenti)`} className="flex-1 min-w-[220px] text-sm border border-neutral-300 rounded px-2 py-1.5" />
      <div className="flex flex-col">
        <input name="prezzoUnitario" inputMode="decimal" placeholder="Importo €" className="w-28 text-sm border border-neutral-300 rounded px-2 py-1.5" />
        <span className="text-[10px] text-neutral-500 mt-0.5">vuoto = solo testo; negativo = sconto</span>
      </div>
      <button className="btn-3d btn-3d-green text-xs px-3 py-1.5">Aggiungi</button>
      <button type="button" onClick={() => setTesto(false)} className="text-xs text-neutral-600 underline self-center">annulla</button>
    </form>
  );
}
