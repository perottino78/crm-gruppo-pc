"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Fattura in PDF o foto letta dall'AI: viene creata «da verificare» con il PDF allegato. */
export default function LeggiFatturaAI({ attiva }: { attiva: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<{ attesa: boolean; secondi: number; errore?: string }>({ attesa: false, secondi: 0 });
  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const f = fd.get("file");
    if (!(f instanceof File) || !f.size) { setS({ attesa: false, secondi: 0, errore: "Scegli il PDF o la foto della fattura." }); return; }
    if (f.size > 4 * 1024 * 1024) { setS({ attesa: false, secondi: 0, errore: "Oltre 4 MB: riduci il file." }); return; }
    fd.append("azione", "fattura");
    setS({ attesa: true, secondi: 0 });
    const t0 = Date.now();
    const timer = setInterval(() => setS((x) => ({ ...x, secondi: Math.round((Date.now() - t0) / 1000) })), 1000);
    try {
      const r = await fetch("/api/ai/documenti", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({ errore: "Risposta non valida dal server." }));
      if (!r.ok || j.stato === "ERRORE") { setS({ attesa: false, secondi: 0, errore: j.errore ?? j.messaggio ?? "Errore AI" }); return; }
      router.push(`/amministrazione/fatture-acquisto/${j.id}`);
    } catch { setS({ attesa: false, secondi: 0, errore: "Collegamento interrotto: riprova." }); }
    finally { clearInterval(timer); }
  }
  if (!attiva) return <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">La lettura delle fatture PDF con l&apos;AI si attiva con la chiave <code>ANTHROPIC_API_KEY</code> su Vercel. Intanto usa l&apos;inserimento manuale qui sotto.</p>;
  return (
    <form onSubmit={invia} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
      <button disabled={s.attesa} className="btn-3d btn-3d-teal text-sm px-3 py-1.5">{s.attesa ? `Lettura… ${s.secondi}s` : "✨ Leggi il PDF con AI"}</button>
      {s.errore && <span className="text-red-700 w-full">{s.errore}</span>}
    </form>
  );
}
