"use client";

import { useActionState, useRef, useEffect } from "react";
import { caricaDocumenti, type EsitoDocumenti } from "@/app/documenti-actions";

export default function CaricaDocumenti({ entita, entitaId, cartelle }: { entita: string; entitaId: string; cartelle: string[] }) {
  const [esito, invia, inCorso] = useActionState<EsitoDocumenti | null, FormData>(caricaDocumenti, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (esito?.ok) form.current?.reset(); }, [esito]);
  const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";
  return (
    <form ref={form} action={invia} className="flex flex-wrap items-end gap-2 border border-dashed border-neutral-300 rounded p-2">
      <input type="hidden" name="entita" value={entita} />
      <input type="hidden" name="entitaId" value={entitaId} />
      <label className="text-xs font-semibold">Cartella
        <select name="cartella" className={`${inp} block`} defaultValue={cartelle[0]}>{cartelle.map((c) => <option key={c}>{c}</option>)}</select>
      </label>
      <label className="text-xs font-semibold">…oppure nuova cartella
        <input name="nuovaCartella" placeholder="es. Varianti" maxLength={60} className={`${inp} block w-40`} />
      </label>
      <label className="text-xs font-semibold">File (PDF, foto, Word, Excel… max 4 MB l&apos;uno)
        <input type="file" name="file" multiple required className="block text-sm" />
      </label>
      <button disabled={inCorso} className="btn-3d btn-3d-blue text-sm px-3 py-1.5 disabled:opacity-50">{inCorso ? "Caricamento…" : "Carica"}</button>
      {esito && <p className={`w-full text-xs ${esito.ok ? "text-green-800" : "text-red-700"}`}>{esito.messaggio}</p>}
    </form>
  );
}
