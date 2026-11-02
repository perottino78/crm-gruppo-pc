"use client";

// Editor di un'email automatica: oggetto e testo con i segnaposto, anteprima con un cliente di esempio mentre si scrive.
import { useRef, useState } from "react";
import { riempi } from "@/lib/automazioni/personalizza";

export default function EditorEmail({ modello, variante, oggetto, testo, valori, salva, ripristina, personalizzata }: {
  modello: string; variante?: string; oggetto: string; testo: string; valori: Record<string, string>;
  salva: (fd: FormData) => Promise<void>; ripristina: (fd: FormData) => Promise<void>; personalizzata: boolean;
}) {
  const [ogg, setOgg] = useState(oggetto);
  const [txt, setTxt] = useState(testo);
  const area = useRef<HTMLTextAreaElement>(null);
  const sconosciuti = [...new Set([...`${ogg} ${txt}`.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((k) => !(k in valori)))];
  const inserisci = (k: string) => {
    const t = area.current;
    if (!t) return setTxt((x) => `${x}{${k}}`);
    const a = t.selectionStart, b = t.selectionEnd;
    const nuovo = `${txt.slice(0, a)}{${k}}${txt.slice(b)}`;
    setTxt(nuovo);
    requestAnimationFrame(() => { t.focus(); t.selectionStart = t.selectionEnd = a + k.length + 2; });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form action={salva} className="space-y-2">
        <input type="hidden" name="modello" value={modello} />
        {variante && <input type="hidden" name="variante" value={variante} />}
        <label className="block text-xs font-bold text-neutral-700">Oggetto
          <input name="oggetto" value={ogg} onChange={(e) => setOgg(e.target.value)} className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm font-normal" />
        </label>
        <label className="block text-xs font-bold text-neutral-700">Testo
          <textarea ref={area} name="testo" value={txt} onChange={(e) => setTxt(e.target.value)} rows={16} className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-[13px] font-normal leading-5" />
        </label>
        <div className="flex flex-wrap gap-1">
          {["nome", "data_appuntamento", "consulente", "telefono_ufficio", "promozione", "sito"].map((k) => (
            <button key={k} type="button" onClick={() => inserisci(k)} className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 hover:bg-violet-100">+ {`{${k}}`}</button>
          ))}
        </div>
        {sconosciuti.length > 0 && <p className="text-xs font-semibold text-red-700">⚠ Segnaposto sconosciuti: {sconosciuti.map((k) => `{${k}}`).join(", ")} — controlla come sono scritti (vedi l&apos;elenco in alto).</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="btn-3d btn-3d-green px-4 py-2 text-sm">💾 Salva il testo</button>
          {personalizzata && <button formAction={ripristina} className="btn-3d btn-3d-outline px-3 py-2 text-xs">↩ Torna al testo standard</button>}
        </div>
      </form>
      <div>
        <div className="mb-1 text-xs font-bold text-neutral-700">Anteprima (cliente di esempio)</div>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="bg-orange-600 px-4 py-2 text-sm font-bold text-white">Gruppo P&amp;C</div>
          <div className="border-b border-neutral-100 px-4 py-2 text-sm font-bold text-neutral-900">{riempi(ogg, valori).replace(/\s+/g, " ")}</div>
          <pre className="whitespace-pre-wrap px-4 py-3 font-sans text-[13px] leading-5 text-neutral-800">{riempi(txt, valori)}</pre>
        </div>
      </div>
    </div>
  );
}
