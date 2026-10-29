import Link from "next/link";
import type { Gruppo } from "@/lib/documenti/correlati";

const dim = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const icona = (m: string) => (m === "application/pdf" ? "📕" : m.startsWith("image/") ? "🖼️" : /sheet|excel|csv/.test(m) ? "📊" : /word/.test(m) ? "📝" : /xml/.test(m) ? "🧾" : "📄");

/** Tutti i documenti collegati a un cliente, raggruppati per pratica (preventivo, commessa, ordini, bolle, fatture). */
export default function DocumentiCorrelati({ gruppi, titolo = "Tutti i documenti correlati" }: { gruppi: Gruppo[]; titolo?: string }) {
  const totale = gruppi.reduce((t, g) => t + g.documenti.length, 0);
  const tipi = [...new Set(gruppi.map((g) => g.tipo))];
  return (
    <section className="bg-white border border-neutral-200 rounded-lg p-4">
      <h2 className="font-bold text-neutral-900 mb-1">🗂️ {titolo} <span className="text-xs font-normal text-neutral-500">({totale} file in {gruppi.filter((g) => g.documenti.length).length} cartelle)</span></h2>
      <p className="text-xs text-neutral-500 mb-2">Ogni file resta nella sua pratica: per caricarne di nuovi apri la pratica.</p>
      {tipi.map((t) => {
        const lista = gruppi.filter((g) => g.tipo === t);
        return (
          <div key={t} className="mb-2">
            <p className="text-xs font-bold text-neutral-600 uppercase tracking-wide">{t}</p>
            <ul className="space-y-1">
              {lista.map((g) => (
                <li key={g.entita + g.entitaId}>
                  <details open={g.documenti.length > 0 && g.documenti.length <= 4} className="border border-neutral-200 rounded">
                    <summary className="cursor-pointer px-3 py-1.5 text-sm"><Link href={g.link} className="text-blue-800 underline font-medium">{g.titolo}</Link> <span className="text-neutral-500">({g.documenti.length})</span></summary>
                    {g.documenti.length > 0 ? (
                      <ul className="divide-y divide-neutral-100">
                        {g.documenti.map((d) => (
                          <li key={d.id} className="px-3 py-1 text-sm flex flex-wrap gap-2 items-center">
                            <a href={`/api/documenti/${d.id}`} target="_blank" rel="noopener" className="text-blue-800 underline break-all">{icona(d.mime)} {d.nome}</a>
                            <span className="text-xs text-neutral-500">📂 {d.cartella} · {dim(d.dimensione)} · {d.createdAt.toLocaleDateString("it-IT")}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="px-3 py-1 text-xs text-neutral-500">Nessun file.</p>}
                  </details>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
