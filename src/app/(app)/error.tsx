"use client";

import { useEffect } from "react";

// Quando una pagina del CRM va in errore mostra cosa è successo (Ugo 24/11/2026, pratica che non si apriva: la schermata
// standard di Next non dice niente). Il codice «digest» si ritrova nei log del server: basta mandare lo screenshot.
export default function ErrorePagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Errore pagina:", error); }, [error]);
  return (
    <div className="mx-auto mt-16 max-w-xl rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm" role="alert">
      <p className="text-3xl">⚠️</p>
      <h1 className="mt-2 text-xl font-bold text-neutral-900">Questa pagina non si è aperta</h1>
      <p className="mt-2 text-sm text-neutral-700">Prova a ricaricarla. Se si ripete, manda uno screenshot di questa schermata con «🆘 Segnala un problema».</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button onClick={() => reset()} className="btn-3d btn-3d-green px-4 py-2 text-sm">🔄 Riprova</button>
        <button onClick={() => window.history.back()} className="btn-3d btn-3d-outline px-4 py-2 text-sm">← Indietro</button>
      </div>
      <p className="mt-4 break-words rounded bg-neutral-50 p-2 text-left text-[11px] text-neutral-600">
        Dettaglio: {error.message || "errore sconosciuto"}{error.digest ? ` · codice ${error.digest}` : ""}<br />
        Pagina: {typeof window !== "undefined" ? window.location.pathname + window.location.search : ""}
      </p>
    </div>
  );
}
