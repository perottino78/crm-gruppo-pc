"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Chiede all'AI di controllare l'anteprima d'importazione (prezzi strani, doppioni, categorie incoerenti). */
export default function ControlloAI({ id, testo }: { id: string; testo: string | null }) {
  const router = useRouter();
  const [attesa, setAttesa] = useState(false);
  const [errore, setErrore] = useState("");
  async function controlla() {
    setAttesa(true); setErrore("");
    const fd = new FormData();
    fd.append("azione", "controllo"); fd.append("id", id);
    try {
      const r = await fetch("/api/articoli/ai", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErrore(j.errore ?? "Errore AI"); else router.refresh();
    } catch { setErrore("Collegamento non riuscito."); }
    setAttesa(false);
  }
  return (
    <section className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <b>✨ Controllo AI</b>
        <button type="button" onClick={controlla} disabled={attesa} className="btn-3d btn-3d-teal text-xs px-2 py-1">{attesa ? "Controllo in corso…" : testo ? "Ricontrolla" : "Fai controllare all'AI prima di confermare"}</button>
        <span className="text-xs text-teal-900">Cerca prezzi con la virgola spostata, costi a zero, margini anomali, doppioni, descrizioni incoerenti.</span>
      </div>
      {errore && <p className="text-red-700">{errore}</p>}
      {testo && <div className="whitespace-pre-wrap text-neutral-800 bg-white rounded border border-teal-100 p-2">{testo}</div>}
    </section>
  );
}
