"use client";

// Tendina che salva da sola appena si cambia la scelta (niente pulsante «salva»: richiesta di Rocco).
// Invia il modulo che la contiene; durante il salvataggio compare la rotella di InvioInCorso.
export default function SelectAutoInvio({ name, defaultValue, opzioni, className, titolo }: {
  name: string; defaultValue?: string; opzioni: { valore: string; etichetta: string }[]; className?: string; titolo?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} title={titolo} className={className} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {opzioni.map((o) => <option key={o.valore} value={o.valore}>{o.etichetta}</option>)}
    </select>
  );
}
