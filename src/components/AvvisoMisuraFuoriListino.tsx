"use client";

import { useEffect, useRef } from "react";

// Piccolo componente client: quando il server rimanda alla pagina preventivo
// con ?errore=... (es. misura fuori listino, sia troppo piccola che troppo
// grande), oltre al banner rosso già mostrato in pagina apriamo anche un vero
// pop-up (alert) cosi' il messaggio non passa inosservato se il commerciale
// e' scrollato piu' in basso nel selettore prodotto.
export default function AvvisoMisuraFuoriListino({ errore }: { errore?: string }) {
  const giaMostrato = useRef(false);

  useEffect(() => {
    if (errore && !giaMostrato.current) {
      giaMostrato.current = true;
      window.alert(`⚠️ Misura fuori listino\n\n${errore}`);
    }
  }, [errore]);

  return null;
}
