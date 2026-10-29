"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Foto o PDF della bolla: l'AI compila numero, data e righe abbinandole agli ordini aperti. */
export default function LeggiBollaAI({ bollaId, attiva }: { bollaId: string; attiva: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<{ attesa: boolean; secondi: number; errore?: string; esito?: string }>({ attesa: false, secondi: 0 });
  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const f = fd.get("file");
    if (!(f instanceof File) || !f.size) { setS({ attesa: false, secondi: 0, errore: "Scegli la foto o il PDF della bolla." }); return; }
    if (f.size > 4 * 1024 * 1024) { setS({ attesa: false, secondi: 0, errore: "Oltre 4 MB: riduci la foto." }); return; }
    fd.append("azione", "bolla"); fd.append("bollaId", bollaId);
    setS({ attesa: true, secondi: 0 });
    const t0 = Date.now();
    const timer = setInterval(() => setS((x) => ({ ...x, secondi: Math.round((Date.now() - t0) / 1000) })), 1000);
    try {
      const r = await fetch("/api/ai/documenti", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({ errore: "Risposta non valida dal server." }));
      if (!r.ok) { setS({ attesa: false, secondi: 0, errore: j.errore ?? "Errore AI" }); return; }
      setS({ attesa: false, secondi: 0, esito: `Lette ${j.righe} righe, ${j.abbinate} abbinate agli ordini aperti. Controllale e spuntale qui sotto.` });
      router.refresh();
    } catch { setS({ attesa: false, secondi: 0, errore: "Collegamento interrotto: riprova." }); }
    finally { clearInterval(timer); }
  }
  if (!attiva) return <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">La lettura della bolla con l&apos;AI si attiva con la chiave <code>ANTHROPIC_API_KEY</code> su Vercel. Intanto aggiungi le righe dagli ordini qui sotto.</p>;
  return (
    <form onSubmit={invia} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" capture="environment" className="text-sm" />
      <button disabled={s.attesa} className="btn-3d btn-3d-teal text-sm px-3 py-1.5">{s.attesa ? `Lettura… ${s.secondi}s` : "✨ Leggi la bolla con AI"}</button>
      {s.errore && <span className="text-red-700 w-full">{s.errore}</span>}
      {s.esito && <span className="text-green-800 w-full">{s.esito}</span>}
    </form>
  );
}
