"use client";

import { useState, useTransition } from "react";
import { inviaOrdineEmail, type EsitoInvio } from "@/app/ordini-actions";

export default function InviaOrdine({ ordineId, a, cc, oggetto, testo, pdfUrl, giaInviato }: { ordineId: string; a: string; cc: string; oggetto: string; testo: string; pdfUrl: string; giaInviato: boolean }) {
  const [dest, setDest] = useState(a), [copia, setCopia] = useState(cc), [ogg, setOgg] = useState(oggetto), [corpo, setCorpo] = useState(testo);
  const [esito, setEsito] = useState<EsitoInvio | null>(null);
  const [inCorso, avvia] = useTransition();
  const inp = "border border-neutral-300 rounded px-2 py-1 text-sm w-full";
  const invia = () => avvia(async () => {
    const r = await inviaOrdineEmail(ordineId, dest, copia, ogg, corpo);
    setEsito(r);
    if (r.mailto) window.location.href = r.mailto;
  });
  return (
    <div className="space-y-2">
      <div className="grid md:grid-cols-2 gap-2">
        <label className="text-xs font-semibold">A (email ordini del fornitore)<input value={dest} onChange={(e) => setDest(e.target.value)} className={inp} placeholder="ordini@fornitore.it" /></label>
        <label className="text-xs font-semibold">Copia a<input value={copia} onChange={(e) => setCopia(e.target.value)} className={inp} /></label>
      </div>
      <label className="text-xs font-semibold block">Oggetto<input value={ogg} onChange={(e) => setOgg(e.target.value)} className={inp} /></label>
      <label className="text-xs font-semibold block">Messaggio<textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={6} className={inp} /></label>
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={invia} disabled={inCorso || !dest} className="btn-3d btn-3d-green text-sm px-4 py-2 disabled:opacity-50">{inCorso ? "Invio…" : giaInviato ? "✉ Reinvia per email con PDF" : "✉ Invia per email con PDF"}</button>
        <a href={`${pdfUrl}?scarica=1`} className="btn-3d btn-3d-dark text-sm px-4 py-2">⬇ Scarica PDF</a>
        <a href={pdfUrl} target="_blank" rel="noopener" className="text-sm text-blue-800 underline">anteprima</a>
      </div>
      {esito && <p className={`text-sm rounded p-2 ${esito.ok ? "bg-green-50 text-green-900" : esito.mailto ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}>{esito.messaggio}</p>}
    </div>
  );
}
