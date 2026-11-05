"use client";

import { useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { cambiaPassword } from "@/app/actions";

/** Finestra che blocca il CRM finché non si sceglie una password personale (primo accesso o password di default). */
export default function CambioPasswordObbligatorio({ nome }: { nome: string }) {
  const errore = useSearchParams().get("errore");
  const percorso = usePathname();
  const [invio, setInvio] = useState(false);
  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="titolo-pw">
      <form action={cambiaPassword} onSubmit={() => setInvio(true)} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <p className="text-3xl">🔑</p>
        <h2 id="titolo-pw" className="mt-1 text-xl font-extrabold text-neutral-900">Scegli la tua password</h2>
        <p className="mt-1 text-sm text-neutral-600">Ciao {nome.split(" ")[0]}, stai usando una password provvisoria. Prima di continuare scegline una tua (almeno 8 caratteri).</p>
        {errore && <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{errore}</p>}
        <input type="hidden" name="torna" value={percorso} />
        <label className="mt-4 block text-xs font-semibold text-neutral-700">Nuova password
          <input type="password" name="nuovaPassword" required minLength={8} autoComplete="new-password" autoFocus className={campo} />
        </label>
        <label className="mt-3 block text-xs font-semibold text-neutral-700">Ripetila
          <input type="password" name="conferma" required minLength={8} autoComplete="new-password" className={campo} />
        </label>
        <button disabled={invio} className="btn-3d btn-3d-green mt-5 w-full py-2.5 text-sm disabled:opacity-60">{invio ? "Salvataggio…" : "Salva e continua"}</button>
      </form>
    </div>
  );
}
