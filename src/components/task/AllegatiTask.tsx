"use client";

import { useRef, useState } from "react";
import { canvasInWebpBlob } from "@/lib/immagini/webp-client";

const MAX_TOTALE = 5 * 1024 * 1024; // il modulo non può superare i 6 MB: teniamo un margine

/** Riduce una foto a WebP leggero (max 1600 px); gli altri file (PDF, Word…) restano come sono. */
async function alleggerisci(f: File): Promise<File> {
  if (!/^image\/(jpeg|png|heic|heif|webp)$/i.test(f.type)) return f;
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const r = await canvasInWebpBlob(c, 0.8);
    if (!r || r.blob.size >= f.size) return f;
    return new File([r.blob], f.name.replace(/\.[a-z0-9]+$/i, "") + "." + r.est, { type: r.blob.type });
  } catch { return f; }
}

/** «📎 Allega file e foto» per il nuovo task: le foto si riducono da sole prima dell'invio. */
export default function AllegatiTask({ name = "file" }: { name?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [elenco, setElenco] = useState<{ nome: string; kb: number }[]>([]);
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function scelti(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    if (!files.length) return;
    setLavoro(true); setErrore(null);
    const pronti = await Promise.all(files.map(alleggerisci));
    const totale = pronti.reduce((s, f) => s + f.size, 0);
    if (totale > MAX_TOTALE) {
      setErrore("Gli allegati insieme superano 5 MB: togline qualcuno o caricali dopo dalla scheda «File» del task.");
      if (ref.current) ref.current.value = "";
      setElenco([]); setLavoro(false); return;
    }
    const dt = new DataTransfer();
    pronti.forEach((f) => dt.items.add(f));
    if (ref.current) ref.current.files = dt.files;
    setElenco(pronti.map((f) => ({ nome: f.name, kb: Math.max(1, Math.round(f.size / 1024)) })));
    setLavoro(false);
  }

  return (
    <div className="sm:col-span-2 text-xs font-semibold text-neutral-700">
      <span>📎 Allega file e foto (facoltativo)</span>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => ref.current?.click()} disabled={lavoro} className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">
          {lavoro ? "Preparo i file…" : "📁 Scegli dal computer o scatta una foto"}
        </button>
        {elenco.length > 0 && <button type="button" className="text-xs text-red-700 underline" onClick={() => { if (ref.current) ref.current.value = ""; setElenco([]); }}>togli gli allegati</button>}
      </div>
      <input ref={ref} type="file" name={name} multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" onChange={scelti} className="hidden" />
      {elenco.length > 0 && <ul className="mt-1 font-normal text-neutral-600">{elenco.map((f, i) => <li key={i}>• {f.nome} ({f.kb} KB)</li>)}</ul>}
      {errore && <p className="mt-1 font-semibold text-red-700">{errore}</p>}
    </div>
  );
}
