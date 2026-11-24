"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { canvasInWebpBlob } from "@/lib/immagini/webp-client";

type Riga = { nome: string; stato: "su" | "ok" | "err"; msg?: string };

/** Foto ridotte nel browser (1600 px, WebP) così anche quelle da 10 MB del telefono partono leggere. Se non si leggono, parte l'originale. */
async function riduci(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const r = await canvasInWebpBlob(canvas, 0.75);
    if (!r) return file;
    return new File([r.blob], file.name.replace(/\.[^.]+$/, "") + "." + r.est, { type: r.blob.type });
  } catch { return file; }
}

export default function CaricaDocumenti({ entita, entitaId, cartelle, nuovaCartella = true }: { entita: string; entitaId: string; cartelle: string[]; nuovaCartella?: boolean }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [righe, setRighe] = useState<Riga[]>([]);
  const [inCorso, setInCorso] = useState(false);
  const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";

  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = form.current!;
    const files = Array.from((f.elements.namedItem("file") as HTMLInputElement).files ?? []);
    if (!files.length) return;
    const cartella = ((f.elements.namedItem("nuovaCartella") as HTMLInputElement | null)?.value.trim()) || (f.elements.namedItem("cartella") as HTMLSelectElement).value;
    setInCorso(true);
    setRighe(files.map((x) => ({ nome: x.name, stato: "su" as const })));
    const agg = (i: number, x: Partial<Riga>) => setRighe((r) => r.map((y, j) => (j === i ? { ...y, ...x } : y)));
    for (let i = 0; i < files.length; i++) {
      try {
        const file = await riduci(files[i]);
        const fd = new FormData();
        fd.append("entita", entita); fd.append("entitaId", entitaId); fd.append("cartella", cartella); fd.append("file", file);
        const res = await fetch("/api/documenti/carica", { method: "POST", body: fd });
        const j = await res.json().catch(() => null) as { ok?: boolean; errore?: string } | null;
        if (res.ok && j?.ok) agg(i, { stato: "ok" });
        else agg(i, { stato: "err", msg: j?.errore ?? (res.status === 413 ? "File troppo pesante" : `Errore ${res.status}`) });
      } catch { agg(i, { stato: "err", msg: "Connessione interrotta" }); }
    }
    setInCorso(false);
    f.reset();
    router.refresh();
  }

  return (
    <form ref={form} onSubmit={invia} className="flex flex-wrap items-end gap-2 border border-dashed border-neutral-300 rounded p-2">
      <label className="text-xs font-semibold">Cartella
        <select name="cartella" className={`${inp} block`} defaultValue={cartelle[0]}>{cartelle.map((c) => <option key={c}>{c}</option>)}</select>
      </label>
      {nuovaCartella && (
        <label className="text-xs font-semibold">…oppure nuova cartella
          <input name="nuovaCartella" placeholder="es. Varianti" maxLength={60} className={`${inp} block w-40`} />
        </label>
      )}
      <label className="text-xs font-semibold">File (foto, PDF, Word, Excel…): le foto si riducono da sole
        <input type="file" name="file" multiple required className="block text-sm" />
      </label>
      <button disabled={inCorso} className="btn-3d btn-3d-blue text-sm px-3 py-1.5 disabled:opacity-50">{inCorso ? "Caricamento…" : "Carica"}</button>
      {righe.length > 0 && (
        <div className="w-full space-y-0.5">
          <p className="text-xs font-semibold text-neutral-700">{righe.filter((x) => x.stato === "ok").length} di {righe.length} file caricati{inCorso ? " — aspetta che finiscano" : righe.some((x) => x.stato === "err") ? " — alcuni non sono partiti" : " ✓"}</p>
          {righe.map((x, i) => (
            <p key={i} className={`text-xs ${x.stato === "ok" ? "text-green-800" : x.stato === "err" ? "text-red-700" : "text-neutral-600"}`}>{x.stato === "ok" ? "✓" : x.stato === "err" ? "✗" : "⏳"} {x.nome}{x.msg ? ` — ${x.msg}` : ""}</p>
          ))}
        </div>
      )}
    </form>
  );
}
