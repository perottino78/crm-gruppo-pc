// Mostrato subito mentre si apre un'altra pagina del CRM: così chi ha cliccato vede che sta caricando (richiesta di Ugo 21/11/2026).
export default function Caricamento() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-neutral-600" role="status" aria-live="polite">
      <span className="velo-attesa-rotella" />
      <p className="text-sm font-semibold">Carico la pagina…</p>
      <div className="w-full max-w-3xl space-y-3 opacity-60" aria-hidden="true">
        <div className="h-8 w-1/2 animate-pulse rounded bg-neutral-200" />
        <div className="h-24 w-full animate-pulse rounded bg-neutral-100" />
        <div className="h-24 w-full animate-pulse rounded bg-neutral-100" />
      </div>
    </div>
  );
}
