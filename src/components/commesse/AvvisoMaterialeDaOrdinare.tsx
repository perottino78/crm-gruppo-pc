"use client";

import { useEffect, useState } from "react";

/**
 * Finestra all'apertura della pratica quando c'è ancora materiale da ordinare (Ugo 23/11/2026: «altrimenti ce ne dimentichiamo»).
 * Compare una volta per ogni apertura della scheda del browser; «Vai agli ordini» porta al riquadro.
 */
export default function AvvisoMaterialeDaOrdinare({ commessaId, ordinate, adesso, rimandate, motivi }: {
  commessaId: string; ordinate: number; adesso: number; rimandate: number; motivi: string[];
}) {
  const [aperto, setAperto] = useState(false);
  const chiave = `avvisoOrdini:${commessaId}`;
  useEffect(() => {
    try { if (!sessionStorage.getItem(chiave)) setAperto(true); } catch { setAperto(true); }
  }, [chiave]);
  if (!aperto) return null;
  const chiudi = () => { try { sessionStorage.setItem(chiave, "1"); } catch { /* niente */ } setAperto(false); };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Materiale ancora da ordinare">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border-4 border-orange-400">
        <p className="text-lg font-bold text-neutral-900">⚠️ Materiale ancora da ordinare</p>
        <p className="mt-2 text-sm text-neutral-800">
          In questa pratica {ordinate > 0 ? <>hai già ordinato <b>{ordinate}</b> {ordinate === 1 ? "riga" : "righe"}, ma </> : null}
          {adesso > 0 && <><b>{adesso}</b> {adesso === 1 ? "riga è" : "righe sono"} da ordinare ora</>}
          {adesso > 0 && rimandate > 0 ? " e " : ""}
          {rimandate > 0 && <><b>{rimandate}</b> {rimandate === 1 ? "è messa" : "sono messe"} da parte «da ordinare più avanti»</>}.
        </p>
        {motivi.length > 0 && <p className="mt-2 rounded bg-orange-50 px-3 py-2 text-sm text-orange-950">⏳ {motivi.join(" · ")}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button onClick={chiudi} className="btn-3d btn-3d-outline px-4 py-2 text-sm">Ho capito</button>
          <a href={`/commesse/${commessaId}?passo=MATERIALE#materiale-pratica`} onClick={chiudi} className="btn-3d btn-3d-orange px-4 py-2 text-sm">Vai agli ordini →</a>
        </div>
      </div>
    </div>
  );
}
