// Percorso guidato della pratica (richiesta di Ugo, 18/11/2026): barra dei passi in alto e navigazione «← passo prima» / «passo attuale →».
// La pagina mostra solo il passo scelto; i passi dopo quello attuale non si aprono finché il corrente non è salvato.
import Link from "next/link";
import type { PassoPratica, ChiavePasso } from "@/lib/pratica/passi";

const ICONA = { FATTO: "✅", ORA: "👉", IN_ATTESA: "⏳" } as const;

export function BarraPassi({ commessaId, passi, mostrato, corrente }: { commessaId: string; passi: PassoPratica[]; mostrato: ChiavePasso | null; corrente: ChiavePasso | null }) {
  return (
    <nav aria-label="Passi della pratica" className="mb-4 rounded-xl border border-neutral-200 bg-white p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Percorso della pratica · un passo alla volta</p>
      <ol className="flex flex-wrap gap-1.5">
        {passi.map((p, i) => {
          const apribile = p.stato === "FATTO" || p.parallelo || p.chiave === corrente;
          const attivo = p.chiave === mostrato;
          const cls = `rounded-lg border px-2.5 py-1.5 text-xs leading-tight ${attivo ? "border-blue-600 bg-blue-600 text-white" : p.stato === "FATTO" ? "border-green-300 bg-green-50 text-green-900" : p.stato === "ORA" ? "border-blue-300 bg-blue-50 text-blue-900" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`;
          const testo = (
            <>
              <span className="font-bold">{ICONA[p.stato]} {i + 1} · {p.titolo}</span>
              <span className={`block text-[10px] ${attivo ? "text-blue-100" : "opacity-80"}`}>{p.chi}{p.parallelo ? " · in parallelo" : ""}</span>
            </>
          );
          return (
            <li key={p.chiave}>
              {apribile
                ? <Link href={`/commesse/${commessaId}?passo=${p.chiave}`} scroll={false} className={`${cls} block`} title={p.nota}>{testo}</Link>
                : <span className={`${cls} block cursor-not-allowed`} title="Si apre quando il passo prima è salvato">{testo}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Sopra il passo mostrato: dove sono, cosa fare e come tornare indietro o al passo attuale. */
export function TestataPasso({ commessaId, passo, precedente, corrente }: { commessaId: string; passo: PassoPratica; precedente: PassoPratica | null; corrente: PassoPratica | null }) {
  const rivedendo = passo.chiave !== corrente?.chiave;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {precedente && (
        <Link href={`/commesse/${commessaId}?passo=${precedente.chiave}`} scroll={false} className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">← Torna a: {precedente.titolo}</Link>
      )}
      {rivedendo && corrente && (
        <>
          <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">
            {passo.stato === "FATTO" ? "✏️ Stai rivedendo un passo già fatto: puoi modificarlo." : "Passo in parallelo."}
          </span>
          <Link href={`/commesse/${commessaId}`} scroll={false} className="btn-3d btn-3d-blue px-3 py-1.5 text-xs">Vai al passo attuale: {corrente.titolo} →</Link>
        </>
      )}
      {!corrente && <span className="rounded bg-green-100 px-2 py-1 text-xs font-bold text-green-900">🎉 Tutti i passi sono fatti.</span>}
    </div>
  );
}
