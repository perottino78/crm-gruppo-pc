// Percorso guidato del progetto (richiesta di Ugo 16/11/2026): dopo l'acconto «Crea progetto», poi i 5 passi in ordine
// (appuntamento di rilievo, rilievi, prodotti e materiale, ordini ai fornitori, arrivo in magazzino). Server component.
import type { PercorsoCommessa } from "@/lib/progetti/percorso-server";

export default function PercorsoProgetto({ commessaId, percorso: p, creaProgetto, confermaMateriale, ok, avviso }: {
  commessaId: string; percorso: PercorsoCommessa;
  creaProgetto: (fd: FormData) => Promise<void>; confermaMateriale: (fd: FormData) => Promise<void>;
  ok?: string; avviso?: string;
}) {
  // Ugo 22/11/2026: il riquadro «Progetto» ripeteva le tappe già in alto e nell'avanzamento. Resta solo una fascia quando c'è qualcosa da fare
  // (creare il progetto, confermare il materiale) o un messaggio; lo stato e il report economico stanno nell'unica riga «Avanzamento».
  const daFare = p.fase === "DA_CREARE" || p.puoConfermare || !!ok || !!avviso;
  if (!daFare) return null;
  return (
    <div id="progetto" className="scroll-mt-4 mb-4 space-y-3">
      {ok && <p className="text-sm text-green-900 bg-green-50 border border-green-200 rounded px-3 py-2">✅ {ok}</p>}
      {avviso && <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">{avviso}</p>}
      {p.fase === "DA_CREARE" && (
        <form action={creaProgetto} className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-green-300 bg-green-50 px-4 py-3">
          <input type="hidden" name="commessaId" value={commessaId} />
          <p className="text-sm text-green-900 flex-1 min-w-[16rem]">💶 <b>Il cliente ha pagato.</b> Crea il progetto: dentro fissi il rilievo, carichi le misure, inserisci i prodotti e poi ordini ai fornitori.</p>
          <button className="btn-3d btn-3d-green">➕ Crea progetto</button>
        </form>
      )}
      {p.puoConfermare && (
        <form action={confermaMateriale} className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-blue-300 bg-blue-50 px-4 py-3">
          <input type="hidden" name="commessaId" value={commessaId} />
          <p className="text-sm text-blue-900 flex-1 min-w-[16rem]">Rilievo caricato e materiale completo. <b>Conferma</b> per passare agli ordini ai fornitori: parte il task per l&apos;ufficio ordini.</p>
          <button className="btn-3d btn-3d-blue">✅ Conferma materiale</button>
        </form>
      )}
    </div>
  );
}
