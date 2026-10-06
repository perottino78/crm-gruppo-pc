"use client";

import { useRef, useState } from "react";

/** Selettore multiplo di foto: ridimensiona/comprime lato client e mette un array JSON di data URI nel campo nascosto `name`. */
export default function FotoRilievo({ name }: { name: string }) {
  const [foto, setFoto] = useState<{ nome: string; dataUri: string }[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const MAX_LATO = 1400;

  function comprimi(file: File): Promise<string> {
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
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setErrore(null);
    setCaricamento(true);
    try {
      const nuove: { nome: string; dataUri: string }[] = [];
      for (const f of files) nuove.push({ nome: f.name, dataUri: await comprimi(f) });
      const tot = [...foto, ...nuove].slice(0, 12);
      const peso = tot.reduce((s, x) => s + x.dataUri.length, 0);
      if (peso > 5_000_000) setErrore("Troppe foto in un solo invio: salva e caricane altre dopo.");
      else setFoto(tot);
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
      <input ref={ref} type="file" accept="image/*" multiple onChange={onChange} className="text-xs" />
      {caricamento && <p className="text-xs text-neutral-600 mt-1">Elaborazione foto…</p>}
      {errore && <p className="text-xs text-red-700 mt-1">{errore}</p>}
      {foto.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {foto.map((f, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.dataUri} alt={f.nome} className="h-16 w-16 object-cover rounded border border-neutral-300" />
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
