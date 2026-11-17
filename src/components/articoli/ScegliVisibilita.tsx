import { RUOLI_VISIBILITA, UFFICI_VISIBILITA, testoVisibilita } from "@/lib/articoli/visibilita";

/** «Chi può vedere questo listino»: spunte per ruolo e ufficio; nessuna spunta = tutti. Campo `visibileA` del modulo. */
export default function ScegliVisibilita({ valore, aperto = false }: { valore: string[]; aperto?: boolean }) {
  const casella = (t: { chiave: string; nome: string }) => (
    <label key={t.chiave} className="flex items-center gap-1.5 text-xs">
      <input type="checkbox" name="visibileA" value={t.chiave} defaultChecked={valore.includes(t.chiave)} /> {t.nome}
    </label>
  );
  return (
    <details open={aperto} className="col-span-full rounded border border-neutral-200 bg-white px-2 py-1">
      <summary className="cursor-pointer text-xs font-semibold text-neutral-700">👁️ Chi lo vede: <span className={valore.length ? "text-amber-800" : "text-green-800"}>{testoVisibilita(valore)}</span></summary>
      <div className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-1"><p className="text-[11px] font-bold uppercase text-neutral-500">Ruoli</p>{RUOLI_VISIBILITA.map(casella)}</div>
        <div className="space-y-1"><p className="text-[11px] font-bold uppercase text-neutral-500">Uffici</p>{UFFICI_VISIBILITA.map(casella)}</div>
        <p className="text-[11px] text-neutral-500 md:col-span-2">Nessuna spunta = lo vedono tutti quelli che hanno accesso agli articoli. L&apos;amministratore e chi gestisce gli articoli lo vedono sempre.</p>
      </div>
    </details>
  );
}
