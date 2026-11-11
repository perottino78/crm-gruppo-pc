"use client";

// Optional di una riga prodotto in una finestra a parte (richiesta di Rocco: «un tasto optional che apre un'ulteriore
// finestra dove aggiungerli e configurarli»). Dentro ci sono gli stessi moduli di prima (tendine per colore, motore,
// accessori… a seconda del prodotto). Si apre dal pulsante sulla riga o, appena aggiunto il prodotto dalla finestra
// «negozio», con «⚙️ Scegli gli optional». Se il prodotto non ha optional il pulsante non compare.
import { useEffect, useRef, useState, type ReactNode } from "react";

type Finestra = Window & { __apriOptional?: string };

export default function FinestraOptional({ rigaId, titolo, scelti, children }: { rigaId: string; titolo: string; scelti: number; children: ReactNode }) {
  const [aperto, setAperto] = useState(false);
  const [vuoto, setVuoto] = useState(false);
  const contenuto = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVuoto(!contenuto.current || contenuto.current.childElementCount === 0);
    const w = window as Finestra;
    if (w.__apriOptional === rigaId) { w.__apriOptional = undefined; setAperto(true); }
    const apri = (e: Event) => {
      if ((e as CustomEvent<{ rigaId: string }>).detail?.rigaId === rigaId) { (window as Finestra).__apriOptional = undefined; setAperto(true); }
    };
    window.addEventListener("apri-optional", apri);
    return () => window.removeEventListener("apri-optional", apri);
  }, [rigaId]);

  useEffect(() => {
    if (!aperto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAperto(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aperto]);

  return (
    <>
      {!vuoto && (
        <button type="button" onClick={() => setAperto(true)} className="mt-2 btn-3d btn-3d-purple text-[11px] px-3 py-1">
          ⚙️ Optional{scelti ? ` (${scelti})` : ""}
        </button>
      )}
      <div
        className={aperto ? "fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-8" : "hidden"}
        onClick={() => setAperto(false)}
      >
        <div role="dialog" aria-modal="true" aria-label={`Optional di ${titolo}`} className={aperto ? "w-full max-w-2xl rounded-2xl bg-white shadow-2xl" : ""} onClick={(e) => e.stopPropagation()}>
          {aperto && (
            <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
              <h3 className="text-base font-bold text-neutral-900">⚙️ Optional — {titolo}</h3>
              <button type="button" onClick={() => setAperto(false)} className="ml-auto rounded-full px-3 py-1 text-lg text-neutral-500 hover:bg-neutral-100" aria-label="Chiudi">✕</button>
            </div>
          )}
          <div ref={contenuto} className={aperto ? "p-4 [&_select]:max-w-full" : ""}>{children}</div>
          {aperto && (
            <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 px-4 py-3">
              <span className="text-xs text-neutral-600">{scelti ? `Già aggiunti: ${scelti}. ` : ""}Ogni optional si aggiunge con il suo pulsante «+ optional».</span>
              <button type="button" onClick={() => setAperto(false)} className="ml-auto btn-3d btn-3d-green px-4 py-1.5 text-sm">✓ Fatto</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
