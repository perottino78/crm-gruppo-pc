"use client";

import { useRef, useState } from "react";
import { canvasInWebp } from "@/lib/immagini/webp-client";

/**
 * Selettore multiplo di foto: ridimensiona/comprime lato client e mette un array JSON di data URI nel campo nascosto `name`.
 * Con `pdf` accetta anche file PDF (rilievi, disegni), mandati così come sono.
 */
export default function FotoRilievo({ name, pdf = false, rilievoId }: { name: string; pdf?: boolean; rilievoId?: string }) {
  // Con `rilievoId` ogni file parte da solo, uno alla volta, subito dopo la scelta (nessun limite al numero di foto, errori per file con «Riprova»)
  const [coda, setCoda] = useState<{ nome: string; stato: "su" | "ok" | "err"; msg?: string; file?: File; blob?: Blob }[]>([]);
  const [foto, setFoto] = useState<{ nome: string; dataUri: string }[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  // foto ridotte a 1280 px: nitide per misure e dettagli, ma leggere. L'invio deve restare sotto il limite di Vercel (≈4,5 MB).
  const MAX_LATO = 1280;
  const MAX_INVIO = 3_400_000;

  function leggiPdf(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (file.size > MAX_INVIO * 0.74) { reject(new Error(`${file.name}: PDF troppo grande (max circa 2,5 MB). Caricalo nei Documenti della pratica.`)); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Lettura file non riuscita"));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  function comprimi(file: File): Promise<string> {
    if (pdf && (file.type === "application/pdf" || /\.pdf$/i.test(file.name))) return leggiPdf(file);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Lettura file non riuscita"));
      reader.onload = () => {
        const img = new window.Image();
        img.onerror = () => reject(new Error(`${file.name}: non è un'immagine valida`));
        img.onload = () => {
          let { width, height } = img;
          if (Math.max(width, height) > MAX_LATO) {
            const k = MAX_LATO / Math.max(width, height);
            width = Math.round(width * k);
            height = Math.round(height * k);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
          resolve(canvasInWebp(canvas, 0.7));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  // foto dal blob WebP/JPEG (o PDF così com'è) al server, un file per volta
  async function suBlob(file: File): Promise<Blob> {
    if (pdf && (file.type === "application/pdf" || /\.pdf$/i.test(file.name))) return file;
    try { const du = await comprimi(file); return await (await fetch(du)).blob(); } catch { return file; } // se il browser non la legge, parte l'originale: la riduce il server
  }
  async function manda(indice: number, nome: string, blob: Blob) {
    const aggiorna = (x: Partial<(typeof coda)[number]>) => setCoda((c) => c.map((r, i) => (i === indice ? { ...r, ...x } : r)));
    aggiorna({ stato: "su", msg: undefined });
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], nome.replace(/\.[^.]+$/, "") + (blob.type === "image/webp" ? ".webp" : blob.type === "application/pdf" ? ".pdf" : /\.[a-z0-9]+$/i.test(nome) ? nome.slice(nome.lastIndexOf(".")) : ".jpg"), { type: blob.type || "image/jpeg" }));
      const res = await fetch(`/api/rilievo/${rilievoId}/foto`, { method: "POST", body: fd });
      const j = await res.json().catch(() => null) as { ok?: boolean; errore?: string } | null;
      if (res.ok && j?.ok) aggiorna({ stato: "ok", blob: undefined });
      else aggiorna({ stato: "err", msg: j?.errore ?? (res.status === 413 ? "File troppo pesante" : `Errore ${res.status}`), blob });
    } catch {
      aggiorna({ stato: "err", msg: "Connessione interrotta", blob });
    }
  }
  async function scegliEManda(files: File[]) {
    setErrore(null);
    const inizio = coda.length;
    setCoda((c) => [...c, ...files.map((f) => ({ nome: f.name, stato: "su" as const }))]);
    for (let i = 0; i < files.length; i++) {
      const b = await suBlob(files[i]);
      await manda(inizio + i, files[i].name, b);
    }
    if (ref.current) ref.current.value = "";
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (rilievoId) { void scegliEManda(files.slice(0, 60)); return; }
    setErrore(null);
    setCaricamento(true);
    try {
      const nuove: { nome: string; dataUri: string }[] = [];
      for (const f of files) nuove.push({ nome: f.name, dataUri: await comprimi(f) });
      const tot = [...foto, ...nuove].slice(0, 12);
      const peso = tot.reduce((s, x) => s + x.dataUri.length, 0);
      if (peso > MAX_INVIO) {
        // tiene quelle che ci stanno e avvisa: le altre si aggiungono con un secondo invio
        const ok: typeof tot = []; let p = 0;
        for (const x of tot) { if (p + x.dataUri.length > MAX_INVIO) break; ok.push(x); p += x.dataUri.length; }
        setFoto(ok);
        setErrore(`Troppi file per un solo invio: ne ho tenuti ${ok.length}. Salva, poi aggiungi gli altri.`);
      } else setFoto(tot);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nel caricamento");
    } finally {
      setCaricamento(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(foto)} />
      <input ref={ref} type="file" accept={pdf ? "image/*,application/pdf,.pdf" : "image/*"} multiple onChange={onChange} className="text-xs" />
      {caricamento && <p className="text-xs text-neutral-600 mt-1">Elaborazione file…</p>}
      {rilievoId && coda.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-semibold text-neutral-700">
            {coda.filter((x) => x.stato === "ok").length} di {coda.length} file caricati
            {coda.some((x) => x.stato === "su") ? " — aspetta che finiscano prima di salvare" : coda.some((x) => x.stato === "err") ? " — alcuni non sono partiti" : " ✓"}
          </p>
          {coda.map((x, i) => (
            <p key={i} className={`text-xs ${x.stato === "ok" ? "text-green-800" : x.stato === "err" ? "text-red-700" : "text-neutral-600"}`}>
              {x.stato === "ok" ? "✓" : x.stato === "err" ? "✗" : "⏳"} {x.nome}{x.msg ? ` — ${x.msg}` : ""}
              {x.stato === "err" && x.blob && <button type="button" onClick={() => manda(i, x.nome, x.blob!)} className="ml-2 underline">Riprova</button>}
            </p>
          ))}
        </div>
      )}
      {errore && <p className="text-xs text-red-700 mt-1">{errore}</p>}
      {foto.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {foto.map((f, i) => (
            <div key={i} className="relative">
              {f.dataUri.startsWith("data:application/pdf") ? (
                <div title={f.nome} className="h-16 w-16 rounded border border-neutral-300 bg-red-50 flex flex-col items-center justify-center text-[10px] text-red-900 px-1 text-center overflow-hidden">📄<span className="truncate w-full">{f.nome}</span></div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.dataUri} alt={f.nome} className="h-16 w-16 object-cover rounded border border-neutral-300" />
              )}
              <button
                type="button"
                onClick={() => setFoto(foto.filter((_, j) => j !== i))}
                className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full text-[10px] w-4 h-4 leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
