"use client";

import { useActionState } from "react";
import Link from "next/link";
import { caricaFattureXml, type EsitoCaricamento } from "@/app/fatture-actions";

/** Caricamento di XML/P7M/ZIP (anche più file insieme, es. lo scarico del cassetto fiscale). */
export default function CaricaFattureXml() {
  const [esito, invia, inCorso] = useActionState<EsitoCaricamento | null, FormData>(caricaFattureXml, null);
  return (
    <form action={invia} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" name="file" multiple accept=".xml,.p7m,.zip,application/xml,text/xml,application/zip" className="text-sm" />
        <button disabled={inCorso} className="btn-3d btn-3d-blue text-sm px-3 py-1.5 disabled:opacity-50">{inCorso ? "Lettura…" : "Carica fatture XML"}</button>
      </div>
      <p className="text-xs text-neutral-500">Accetta .xml, .xml.p7m firmati e .zip con molte fatture. Le fatture già caricate vengono riconosciute e saltate.</p>
      {esito && (
        <div className={`text-sm rounded border p-2 ${esito.ok ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
          <p className="font-semibold">{esito.messaggio}</p>
          <ul className="mt-1 space-y-0.5 max-h-60 overflow-y-auto">
            {esito.voci.map((v, i) => (
              <li key={i} className="text-xs">
                {v.stato === "NUOVA" ? "🆕" : v.stato === "DOPPIA" ? "↩︎" : "⚠️"}{" "}
                {v.id ? <Link href={`/amministrazione/fatture-acquisto/${v.id}`} className="underline">{v.titolo}</Link> : v.titolo}
                {v.messaggio ? <span className="text-neutral-600"> — {v.messaggio}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
