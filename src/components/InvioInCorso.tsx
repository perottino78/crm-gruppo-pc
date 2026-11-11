"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Riscontro "sto lavorando" per tutto il CRM: quando si invia un modulo o si apre un'altra pagina compare una barra blu
 * in alto e il pulsante premuto si spegne (niente doppi clic). Sparisce quando la pagina nuova è pronta.
 * Per i salvataggi (moduli inviati) compare anche una rotella al centro che copre la pagina finché la modifica non è
 * arrivata (richiesta di Rocco: «capire quando una modifica è stata applicata»). I salvataggi automatici possono
 * accenderla e spegnerla con gli eventi `attesa:inizio` / `attesa:fine` su window.
 */
export default function InvioInCorso() {
  const percorso = usePathname();
  const parametri = useSearchParams();
  const [attivo, setAttivo] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);

  // pagina cambiata (anche dopo il redirect di un salvataggio): via la barra e riaccendi i pulsanti
  useEffect(() => {
    setAttivo(false); setSalvataggio(false);
    document.querySelectorAll(".sta-inviando").forEach((el) => el.classList.remove("sta-inviando"));
  }, [percorso, parametri]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let osservatore: MutationObserver | undefined;
    const ferma = () => {
      setAttivo(false); setSalvataggio(false); clearTimeout(timer); osservatore?.disconnect();
      document.querySelectorAll(".sta-inviando").forEach((el) => el.classList.remove("sta-inviando"));
    };
    const avvia = (salva = false) => {
      setAttivo(true); if (salva) setSalvataggio(true); clearTimeout(timer); timer = setTimeout(ferma, 20000);
      // salvataggio senza cambio di pagina: quando arriva la risposta il contenuto si aggiorna → fine attesa
      osservatore?.disconnect();
      const main = document.querySelector("main");
      if (main) setTimeout(() => { osservatore = new MutationObserver(ferma); osservatore.observe(main, { childList: true, subtree: true, characterData: true }); }, 300);
    };
    const alSubmit = (e: SubmitEvent) => {
      if (e.defaultPrevented) return;
      const form = e.target as HTMLFormElement;
      if (form.target === "_blank" || form.dataset.senzaAttesa !== undefined) return;
      const azione = form.getAttribute("action") ?? "";
      if (azione.startsWith("/api/") || azione.startsWith("http")) return; // download / pagine esterne
      const b = e.submitter as HTMLElement | null;
      // la classe si aggiunge dopo l'invio, così il valore del pulsante premuto parte lo stesso
      if (b) setTimeout(() => b.classList.add("sta-inviando"), 0);
      // i moduli di sola ricerca (GET) cambiano pagina: basta la barra
      avvia((form.getAttribute("method") ?? "").toLowerCase() !== "get");
    };
    const alClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || /^(tel|mailto|sms):/i.test(href)) return;
      const dest = new URL(a.href, location.href);
      if (dest.origin !== location.origin || dest.pathname.startsWith("/api/")) return;
      if (dest.pathname === location.pathname && dest.search === location.search) return;
      avvia();
    };
    const inizio = () => avvia(true);
    document.addEventListener("submit", alSubmit);
    document.addEventListener("click", alClic);
    window.addEventListener("attesa:inizio", inizio);
    window.addEventListener("attesa:fine", ferma);
    return () => {
      document.removeEventListener("submit", alSubmit); document.removeEventListener("click", alClic);
      window.removeEventListener("attesa:inizio", inizio); window.removeEventListener("attesa:fine", ferma);
      clearTimeout(timer); osservatore?.disconnect();
    };
  }, []);

  if (!attivo) return null;
  return (
    <>
      <div className="barra-attesa" role="status" aria-label="Sto elaborando…" />
      {salvataggio && (
        <div className="velo-attesa" role="alertdialog" aria-busy="true" aria-label="Salvataggio in corso">
          <div className="velo-attesa-scheda">
            <span className="velo-attesa-rotella" />
            <span>Salvataggio in corso…</span>
          </div>
        </div>
      )}
    </>
  );
}
