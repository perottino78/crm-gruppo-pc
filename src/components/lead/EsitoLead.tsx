"use client";

import { useState } from "react";
import { esitoLead } from "@/app/lead-percorso-actions";

type Opzione = { chiave: string; nome: string; serveData?: "richiamo" | "appuntamento" };

/** Esito della chiamata: mostra solo i campi che servono (data per ricontatto/appuntamento, venditore e indirizzo per l'appuntamento). */
export default function EsitoLead({ leadId, esiti, venditori, venditoreId, indirizzo, dataAppuntamento, ritorno }: {
  leadId: string; esiti: Opzione[]; venditori: { id: string; nome: string }[]; venditoreId: string | null; indirizzo: string; dataAppuntamento: string; ritorno: string;
}) {
  const [esito, setEsito] = useState("");
  const [invio, setInvio] = useState(false);
  const def = esiti.find((e) => e.chiave === esito);
  const appuntamento = def?.serveData === "appuntamento";
  const campo = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
  return (
    <form action={esitoLead} onSubmit={() => setInvio(true)} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} /><input type="hidden" name="ritorno" value={ritorno} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Esito della chiamata">
        {esiti.map((e) => (
          <label key={e.chiave} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold ${esito === e.chiave ? "border-blue-700 bg-blue-700 text-white" : "border-neutral-300 bg-white text-neutral-800 hover:border-neutral-500"}`}>
            <input type="radio" name="esito" value={e.chiave} checked={esito === e.chiave} onChange={() => setEsito(e.chiave)} className="sr-only" required />
            {e.nome}
          </label>
        ))}
      </div>
      {def?.serveData && (
        <label className="block text-xs font-semibold text-neutral-700">{appuntamento ? "Giorno e ora dell'appuntamento" : "Quando richiamare"}
          <input type="datetime-local" name="data" required defaultValue={appuntamento ? dataAppuntamento : ""} className={campo} />
        </label>
      )}
      {appuntamento && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-neutral-700">Venditore
            <select name="venditoreId" defaultValue={venditoreId ?? ""} className={campo}>
              <option value="">da assegnare dopo</option>
              {venditori.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </label>
          {esito === "APPUNTAMENTO_CASA" && (
            <label className="block text-xs font-semibold text-neutral-700">Indirizzo (via, numero, comune)
              <input name="indirizzo" defaultValue={indirizzo} required className={campo} />
            </label>
          )}
        </div>
      )}
      {esito && (
        <label className="block text-xs font-semibold text-neutral-700">Note {appuntamento ? "utili al venditore" : ""} <span className="font-normal text-neutral-500">(facoltative)</span>
          <textarea name="note" rows={2} className={campo} placeholder={appuntamento ? "es. vuole anche la batteria, citofonare Rossi" : "es. richiamare dopo le 18"} />
        </label>
      )}
      <button disabled={!esito || invio} className="btn-3d btn-3d-blue w-full px-4 py-2.5 text-sm disabled:opacity-50 sm:w-auto">
        {invio ? "⏳ Salvataggio in corso…" : esito ? "Registra esito" : "Scegli l'esito della chiamata"}
      </button>
    </form>
  );
}
