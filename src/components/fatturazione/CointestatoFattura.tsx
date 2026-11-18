"use client";

import { useRef, useState } from "react";
import type { Cointestatario } from "@/lib/fatturazione/cointestato";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white w-full";

/** Spunta «Fattura cointestata»: si apre una finestra con i dati del secondo intestatario (restano nel modulo della fattura). */
export default function CointestatoFattura({ iniziale, disabilitato }: { iniziale: Cointestatario | null; disabilitato?: boolean }) {
  const [attivo, setAttivo] = useState(!!iniziale);
  const finestra = useRef<HTMLDialogElement>(null);
  const [c, setC] = useState<Cointestatario>(iniziale ?? { nome: "", cognome: "", codiceFiscale: "" });
  const campo = (k: keyof Cointestatario, label: string, extra = "") => (
    <label className={`text-xs text-neutral-700 ${extra}`}>{label}
      <input name={`cointest_${k}`} value={c[k] ?? ""} onChange={(e) => setC({ ...c, [k]: e.target.value })} className={inp} />
    </label>
  );
  const riassunto = [c.nome, c.cognome].filter(Boolean).join(" ");
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" name="cointestata" checked={attivo} disabled={disabilitato}
          onChange={(e) => { setAttivo(e.target.checked); if (e.target.checked) finestra.current?.showModal(); }} />
        Fattura cointestata
      </label>
      {attivo && (
        <>
          <span className="text-xs text-neutral-700">{riassunto ? `con ${riassunto}${c.codiceFiscale ? ` · C.F. ${c.codiceFiscale}` : ""}` : <b className="text-red-700">mancano i dati del cointestatario</b>}</span>
          <button type="button" onClick={() => finestra.current?.showModal()} className="text-xs underline text-blue-800">{disabilitato ? "vedi i dati" : "modifica i dati"}</button>
        </>
      )}
      <dialog ref={finestra} className="m-auto rounded-xl border border-neutral-300 p-0 w-[min(640px,94vw)] backdrop:bg-black/40">
        <div className="p-4 space-y-3">
          <h3 className="font-bold text-base">👥 Fattura cointestata — secondo intestatario</h3>
          <p className="text-xs text-neutral-600">Il primo intestatario è il cliente scelto nei dati della fattura. Qui scrivi l&apos;altra persona: finisce nella causale della fattura elettronica e nella copia di cortesia.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {campo("nome", "Nome *")}
            {campo("cognome", "Cognome *")}
            {campo("codiceFiscale", "Codice fiscale *")}
            {campo("partitaIva", "Partita IVA (se ce l'ha)")}
            {campo("indirizzo", "Indirizzo (se diverso)", "sm:col-span-2")}
            {campo("cap", "CAP")}
            {campo("comune", "Comune")}
            {campo("provincia", "Provincia (sigla)")}
            {campo("quota", "Quota (facoltativa, es. 50%)")}
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-3d btn-3d-outline text-sm px-3 py-1.5" onClick={() => { setAttivo(false); setC({ nome: "", cognome: "", codiceFiscale: "" }); finestra.current?.close(); }} disabled={disabilitato}>Togli il cointestatario</button>
            <button type="button" className="btn-3d btn-3d-green text-sm px-4 py-1.5" onClick={() => finestra.current?.close()}>✓ Fatto</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
