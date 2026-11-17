"use client";

import { useState } from "react";

type Voce = { id: string; categoria: string; nome: string; valore: number; tipoPrezzo: string; immagineUrl: string };

/**
 * Optional con la foto (pannelli decorativi, maniglioni, maniglie dei portoncini): si guarda la foto e si tocca per scegliere
 * (richiesta di Ugo, 17/11/2026). Il modulo manda lo stesso `optionalId` della tendina di sempre.
 */
export default function ScegliOptionalConFoto({ voci, azione, rigaId, preventivoId }: { voci: Voce[]; azione: (fd: FormData) => void | Promise<void>; rigaId: string; preventivoId: string }) {
  const categorie = [...new Set(voci.map((v) => v.categoria))];
  const [cat, setCat] = useState(categorie[0] ?? "");
  const [scelto, setScelto] = useState<string>("");
  const visibili = voci.filter((v) => v.categoria === cat);
  const prezzo = (v: Voce) => (v.tipoPrezzo === "PERCENTUALE" ? `${v.valore}%` : `${v.valore.toLocaleString("it-IT")} €`);
  const corto = (v: Voce) => v.nome.replace(/^Pannello decorativo /, "").replace(/ \(al posto del vetro\)/, "").replace(/ inox.*$/, "").replace(/^Maniglione /, "");
  return (
    <details className="mt-2 rounded border border-neutral-200 bg-neutral-50 p-2">
      <summary className="cursor-pointer text-xs font-bold text-neutral-800">🖼️ Scegli guardando la foto (pannelli, maniglioni, maniglie)</summary>
      <div className="mt-2 flex flex-wrap gap-1">
        {categorie.map((c) => (
          <button key={c} type="button" onClick={() => { setCat(c); setScelto(""); }} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c === cat ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700"}`}>
            {c.charAt(0) + c.slice(1).toLowerCase()} ({voci.filter((v) => v.categoria === c).length})
          </button>
        ))}
      </div>
      <div className="mt-2 grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5 md:grid-cols-6">
        {visibili.map((v) => (
          <button key={v.id} type="button" onClick={() => setScelto(v.id)} className={`flex flex-col items-center gap-1 rounded border bg-white p-1 text-[10px] leading-tight ${scelto === v.id ? "border-blue-600 ring-2 ring-blue-400" : "border-neutral-200 hover:border-neutral-400"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.immagineUrl} alt={v.nome} loading="lazy" className="h-24 w-full object-contain" />
            <span className="font-semibold">{corto(v)}</span>
            <span className="text-neutral-600">{prezzo(v)}</span>
          </button>
        ))}
      </div>
      <form action={azione} className="mt-2 flex items-center gap-2">
        <input type="hidden" name="rigaId" value={rigaId} />
        <input type="hidden" name="preventivoId" value={preventivoId} />
        <input type="hidden" name="optionalId" value={scelto} />
        <input name="quantita" type="number" defaultValue={1} min={1} className="w-14 rounded border border-neutral-200 px-1.5 py-1 text-xs" />
        <button disabled={!scelto} className="btn-3d btn-3d-green px-3 py-1 text-xs disabled:opacity-40">+ Aggiungi quello scelto</button>
        {scelto && <span className="text-[11px] text-neutral-700">{voci.find((v) => v.id === scelto)?.nome}</span>}
      </form>
    </details>
  );
}
