"use client";

// Modulo che si salva da solo, senza pulsante «salva» (richiesta di Rocco per l'offerta):
// - tendine, spunte e date: appena cambiano;
// - numeri e testi: quando si esce dal campo (o con Invio nei campi di una riga), così non si salva a metà parola.
// Durante il salvataggio InvioInCorso mostra la rotella al centro. Dopo il salvataggio Next ridisegna la pagina:
// chi usa questo componente gli dà una `key` che cambia con i valori salvati, così i campi ripartono da quelli nuovi.
import { useRef, type ReactNode } from "react";

export default function FormAutoSalva({ action, className, children }: {
  action: (fd: FormData) => void | Promise<void>; className?: string; children: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const sporco = useRef(false);
  const invia = () => { sporco.current = false; form.current?.requestSubmit(); };
  const subito = (el: EventTarget | null) => {
    const t = el as HTMLInputElement | null;
    if (!t) return false;
    return t.tagName === "SELECT" || ["checkbox", "radio", "date", "datetime-local", "month", "file", "hidden"].includes(t.type);
  };
  return (
    <form
      ref={form}
      action={action}
      className={className}
      onChange={(e) => { if (subito(e.target)) invia(); else sporco.current = true; }}
      onBlur={() => { if (sporco.current) invia(); }}
      onKeyDown={(e) => {
        const t = e.target as HTMLElement;
        if (e.key === "Enter" && t.tagName === "INPUT") { e.preventDefault(); invia(); }
      }}
    >
      {children}
    </form>
  );
}
