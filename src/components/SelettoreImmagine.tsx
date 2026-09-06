"use client";

import { useRef, useState } from "react";

/**
 * Selettore foto con il vero dialogo "Scegli file" del sistema operativo (Finder/Esplora
 * risorse), al posto di un campo URL da incollare a mano. La foto scelta viene ridimensionata
 * e compressa lato client (canvas) e salvata come data URI nel campo nascosto `name`: non
 * essendo configurato uno storage esterno (es. Vercel Blob), l'immagine viene salvata
 * direttamente nel database come testo — per questo il ridimensionamento è importante,
 * per non appesantire troppo la riga del preventivo.
 */
export default function SelettoreImmagine({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue?: string | null;
  label: string;
}) {
  const [valore, setValore] = useState(defaultValue ?? "");
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const inputFileRef = useRef<HTMLInputElement>(null);

  const MAX_MB_ORIGINALE = 12;
  const MAX_LATO_PX = 1600;

  function ridimensionaEComprimi(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Impossibile leggere il file."));
      reader.onload = () => {
        const img = new window.Image();
        img.onerror = () => reject(new Error("Il file scelto non è un'immagine valida."));
        img.onload = () => {
          let { width, height } = img;
          if (width > MAX_LATO_PX || height > MAX_LATO_PX) {
            const scala = MAX_LATO_PX / Math.max(width, height);
            width = Math.round(width * scala);
            height = Math.round(height * scala);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Impossibile elaborare l'immagine in questo browser."));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function alSelezionaFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permette di riselezionare lo stesso file una seconda volta
    if (!file) return;
    setErrore(null);

    if (!file.type.startsWith("image/")) {
      setErrore("Seleziona un file immagine (JPG, PNG, ecc.).");
      return;
    }
    if (file.size > MAX_MB_ORIGINALE * 1024 * 1024) {
      setErrore(`Il file supera ${MAX_MB_ORIGINALE}MB: scegli una foto più leggera.`);
      return;
    }

    setCaricamento(true);
    try {
      const dataUrl = await ridimensionaEComprimi(file);
      setValore(dataUrl);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore durante il caricamento dell'immagine.");
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <div>
      <label className="text-xs text-neutral-600 block mb-1">{label}</label>
      <input type="hidden" name={name} value={valore} />
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => inputFileRef.current?.click()}
          className="btn-3d btn-3d-outline text-xs px-3 py-1.5"
          disabled={caricamento}
        >
          {caricamento ? "Elaborazione in corso..." : "📁 Scegli foto dal computer..."}
        </button>
        {valore && (
          <button type="button" onClick={() => setValore("")} className="text-xs text-red-600 underline">
            rimuovi immagine
          </button>
        )}
      </div>
      <input ref={inputFileRef} type="file" accept="image/*" onChange={alSelezionaFile} className="hidden" />
      {errore && <p className="text-xs text-red-600 mt-1">{errore}</p>}
      {valore && (
        <img src={valore} alt="Anteprima copertina" className="mt-2 h-24 w-full object-cover rounded border border-neutral-200" />
      )}
    </div>
  );
}
