"use client";

// Crea la chiave del backup e mostra, una volta sola, il comando da incollare sul NAS.
import { useActionState, useState } from "react";
import { generaChiaveBackup, type StatoChiave } from "@/app/backup-actions";

/** Il comando unico per il NAS: crea la cartella .one, salva la chiave, scarica lo script e lo mette nelle attività pianificate. */
export function comandoInstallazione(url: string, chiave: string, cartella: string) {
  const d = `/share/${cartella}/.one`;
  return `mkdir -p "${d}" && cd "${d}" && printf '%s' '${chiave}' > chiave && chmod 600 chiave && curl -fsS -o backup-one.sh ${url}/api/backup/script && sh backup-one.sh --installa`;
}

function Copia({ testo }: { testo: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn-3d btn-3d-blue px-3 py-1.5 text-xs"
      onClick={() => navigator.clipboard.writeText(testo).then(() => { setOk(true); setTimeout(() => setOk(false), 2000); })}>
      {ok ? "✓ Copiato" : "📋 Copia"}
    </button>
  );
}

export function ChiaveBackup({ url, cartella, attivo }: { url: string; cartella: string; attivo: boolean }) {
  const [stato, azione, inCorso] = useActionState<StatoChiave, FormData>(generaChiaveBackup, {});
  if (stato.chiave) {
    const cmd = comandoInstallazione(url, stato.chiave, cartella);
    return (
      <div className="space-y-2">
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          🔑 Chiave creata. Copia ADESSO il comando qui sotto (passo 3): per sicurezza non si vedrà più. Se lo perdi, crea una chiave nuova.
        </p>
        <pre className="whitespace-pre-wrap break-all rounded-lg bg-neutral-900 p-3 text-xs text-green-200">{cmd}</pre>
        <Copia testo={cmd} />
      </div>
    );
  }
  return (
    <form action={azione} className="space-y-2">
      {stato.errore && <p className="text-sm font-semibold text-red-700">{stato.errore}</p>}
      {attivo && (
        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="conferma" value="1" className="mt-1" required />
          <span>Ho capito: con la chiave nuova quella di prima smette di funzionare e va rifatto il passo 3 sul NAS.</span>
        </label>
      )}
      {!attivo && <input type="hidden" name="conferma" value="1" />}
      <button disabled={inCorso} className="btn-3d btn-3d-green px-4 py-2 text-sm">{inCorso ? "Creo…" : attivo ? "🔑 Crea una chiave nuova" : "🔑 Crea la chiave"}</button>
    </form>
  );
}
