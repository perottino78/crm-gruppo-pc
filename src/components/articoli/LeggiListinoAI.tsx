"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { fornitori: { id: string; ragioneSociale: string }[]; categorie: { id: string; etichetta: string }[]; divisioni: string[]; attiva: boolean };
const inp = "border border-neutral-300 rounded px-2 py-1 text-sm w-full";

/** Carica PDF o foto di un listino: l'AI lo trasforma in tabella e si apre l'anteprima d'importazione. */
export default function LeggiListinoAI({ fornitori, categorie, divisioni, attiva }: Props) {
  const router = useRouter();
  const [stato, setStato] = useState<{ attesa: boolean; errore?: string; secondi: number }>({ attesa: false, secondi: 0 });
  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const files = fd.getAll("file").filter((f) => f instanceof File && f.size > 0) as File[];
    if (!files.length) { setStato({ attesa: false, secondi: 0, errore: "Scegli il PDF o le foto del listino." }); return; }
    if (files.reduce((s, f) => s + f.size, 0) > 4 * 1024 * 1024) { setStato({ attesa: false, secondi: 0, errore: "Oltre 4 MB in totale: dividi il PDF (es. 20-30 pagine per volta) o riduci le foto." }); return; }
    fd.append("azione", "listino");
    setStato({ attesa: true, secondi: 0 });
    const t0 = Date.now();
    const timer = setInterval(() => setStato((s) => ({ ...s, secondi: Math.round((Date.now() - t0) / 1000) })), 1000);
    try {
      const r = await fetch("/api/articoli/ai", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({ errore: r.status === 504 ? "Il listino è troppo lungo per una sola lettura: dividilo in parti più piccole." : "Risposta non valida dal server." }));
      if (!r.ok) { setStato({ attesa: false, secondi: 0, errore: j.errore ?? "Errore AI" }); return; }
      router.push(`/prodotti/articoli/importa/${j.id}`);
    } catch {
      setStato({ attesa: false, secondi: 0, errore: "Collegamento interrotto: riprova." });
    } finally {
      clearInterval(timer);
    }
  }
  if (!attiva) return <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">L&apos;aiuto AI non è ancora attivo: va aggiunta la chiave <code>ANTHROPIC_API_KEY</code> nelle impostazioni del progetto su Vercel.</p>;
  return (
    <form onSubmit={invia} className="grid md:grid-cols-6 gap-2 items-end text-sm">
      <label className="md:col-span-6">PDF del listino o foto delle pagine (anche più foto insieme)
        <input type="file" name="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="block mt-1" />
      </label>
      <label className="md:col-span-2">Fornitore del listino<select name="fornitoreId" defaultValue="" className={inp}><option value="">— scegli —</option>{fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}</select></label>
      <label className="md:col-span-2">Divisione<select name="divisione" defaultValue="" className={inp}><option value="">—</option>{divisioni.map((d) => <option key={d}>{d}</option>)}</select></label>
      <label className="md:col-span-2">Categoria se non indicata<select name="categoriaId" defaultValue="" className={inp}><option value="">— lascia decidere all&apos;AI —</option>{categorie.map((c) => <option key={c.id} value={c.id}>{c.etichetta}</option>)}</select></label>
      <label className="md:col-span-5">Indicazioni per l&apos;AI (facoltative)<input name="nota" className={inp} placeholder="es. prezzi IVA esclusa; leggi solo la sezione motori; il prezzo è al metro lineare" /></label>
      <label className="flex items-center gap-1"><input type="checkbox" name="soloAggiornamento" value="1" /> solo aggiorna esistenti</label>
      <div className="md:col-span-6 flex items-center gap-3">
        <button disabled={stato.attesa} className="btn-3d btn-3d-teal text-sm px-3 py-1.5">{stato.attesa ? `Lettura in corso… ${stato.secondi}s` : "✨ Leggi con AI e mostra anteprima"}</button>
        {stato.attesa && <span className="text-xs text-neutral-500">Un listino di 10-20 pagine richiede 1-3 minuti. Non chiudere la pagina.</span>}
      </div>
      {stato.errore && <p className="md:col-span-6 text-sm text-red-700">{stato.errore}</p>}
    </form>
  );
}
