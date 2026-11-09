"use client";

// Editor di un'email automatica: oggetto e testo con i segnaposto, anteprima con un cliente di esempio mentre si scrive.
import { useRef, useState } from "react";
import { riempi, riempiHtml } from "@/lib/automazioni/personalizza";

export default function EditorEmail({ modello, variante, oggetto, testo, formato: formatoIniziale = "TESTO", preheader = "", valori, salva, ripristina, personalizzata }: {
  modello: string; variante?: string; oggetto: string; testo: string; formato?: "TESTO" | "HTML"; preheader?: string; valori: Record<string, string>;
  salva: (fd: FormData) => Promise<void>; ripristina: (fd: FormData) => Promise<void>; personalizzata: boolean;
}) {
  const [ogg, setOgg] = useState(oggetto);
  const [ph, setPh] = useState(preheader);
  const [txt, setTxt] = useState(testo);
  const [formato, setFormato] = useState<"TESTO" | "HTML">(formatoIniziale);
  const html = formato === "HTML";
  // file .html scelto dal computer: il suo contenuto va nel riquadro (si salva con «Salva»)
  const caricaFile = (f: File | undefined) => { if (f) f.text().then((t) => { setTxt(t); setFormato("HTML"); }); };
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
        <label className="block text-xs font-bold text-neutral-700">Preheader <span className="font-normal text-neutral-500">(il testo grigio accanto all&apos;oggetto nella casella; facoltativo, {ph.length}/120)</span>
          <input name="preheader" value={ph} onChange={(e) => setPh(e.target.value)} maxLength={200} placeholder="es. {nome}, il tuo consulente ti aspetta" className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm font-normal" />
        </label>
        <input type="hidden" name="formato" value={formato} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-neutral-700">Formato</span>
          {(["TESTO", "HTML"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFormato(f)} className={`rounded-full border px-3 py-1 font-semibold ${formato === f ? "border-violet-700 bg-violet-700 text-white" : "border-neutral-300 bg-white text-neutral-700"}`}>
              {f === "TESTO" ? "Testo (grafica P&C)" : "HTML"}
            </button>
          ))}
          {html && (
            <label className="cursor-pointer rounded-full border border-neutral-300 bg-white px-3 py-1 font-semibold text-neutral-700 hover:border-neutral-500">📂 Carica un file .html
              <input type="file" accept=".html,.htm,text/html" className="sr-only" onChange={(e) => caricaFile(e.target.files?.[0])} />
            </label>
          )}
        </div>
        {html && <p className="text-[11px] text-neutral-600">Incolla il codice HTML (es. da un editor di newsletter). I segnaposto come {"{nome}"} funzionano anche qui; per i clienti il link per disiscriversi dalle email promozionali si aggiunge da solo in fondo (oppure mettilo dove vuoi con {"{disiscrizione}"}).</p>}
        <label className="block text-xs font-bold text-neutral-700">{html ? "Codice HTML" : "Testo"}
          <textarea ref={area} name="testo" value={txt} onChange={(e) => setTxt(e.target.value)} rows={html ? 20 : 16} spellCheck={!html} className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-[13px] font-normal leading-5" />
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
          {!html && <div className="bg-orange-600 px-4 py-2 text-sm font-bold text-white">Gruppo P&amp;C</div>}
          <div className="border-b border-neutral-100 px-4 py-2 text-sm font-bold text-neutral-900">{riempi(ogg, valori).replace(/\s+/g, " ")}{ph && <span className="block text-xs font-normal text-neutral-500">{riempi(ph, valori)}</span>}</div>
          {html
            ? <iframe title="Anteprima HTML" sandbox="" srcDoc={riempiHtml(txt, valori)} className="h-[560px] w-full border-0 bg-white" />
            : <pre className="whitespace-pre-wrap px-4 py-3 font-sans text-[13px] leading-5 text-neutral-800">{riempi(txt, valori)}</pre>}
        </div>
      </div>
    </div>
  );
}
