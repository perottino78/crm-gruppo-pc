import { getCurrentUser } from "@/lib/auth";
import { documentiDi, puoVedereEntita } from "@/lib/documenti/server";
import { CARTELLE } from "@/lib/ordini/calcoli";
import { eliminaDocumento, spostaDocumento } from "@/app/documenti-actions";
import CaricaDocumenti from "./CaricaDocumenti";

const dim = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const icona = (m: string) => (m === "application/pdf" ? "📕" : m.startsWith("image/") ? "🖼️" : /sheet|excel|csv/.test(m) ? "📊" : /word/.test(m) ? "📝" : "📄");

/** Cartelle documenti di un cliente, preventivo, commessa o ordine fornitore. */
export default async function Documenti({ entita, entitaId, titolo = "Documenti" }: { entita: keyof typeof CARTELLE; entitaId: string; titolo?: string }) {
  const u = await getCurrentUser();
  if (!u || !(await puoVedereEntita(u, entita, entitaId))) return null;
  const docs = await documentiDi(entita, entitaId);
  const cartelle = [...new Set([...CARTELLE[entita], ...docs.map((d) => d.cartella)])];
  const piene = cartelle.filter((c) => docs.some((d) => d.cartella === c));
  return (
    <section className="bg-white border border-neutral-200 rounded-lg p-4 print:hidden">
      <h2 className="font-bold text-neutral-900 mb-2">📁 {titolo} <span className="text-xs font-normal text-neutral-500">({docs.length} file)</span></h2>
      {piene.length === 0 && <p className="text-sm text-neutral-500 mb-2">Nessun documento ancora.</p>}
      <div className="space-y-1 mb-3">
        {piene.map((c) => {
          const lista = docs.filter((d) => d.cartella === c);
          return (
            <details key={c} open={piene.length <= 2} className="border border-neutral-200 rounded">
              <summary className="cursor-pointer px-3 py-1.5 text-sm font-medium">📂 {c} <span className="text-neutral-500 font-normal">({lista.length})</span></summary>
              <ul className="divide-y divide-neutral-100">
                {lista.map((d) => (
                  <li key={d.id} className="px-3 py-1.5 flex flex-wrap items-center gap-2 text-sm">
                    <a href={`/api/documenti/${d.id}`} target="_blank" rel="noopener" className="text-blue-800 underline break-all">{icona(d.mime)} {d.nome}</a>
                    <span className="text-xs text-neutral-500">{dim(d.dimensione)} · {d.createdAt.toLocaleDateString("it-IT")}{d.caricatoDaNome ? ` · ${d.caricatoDaNome}` : ""}</span>
                    <a href={`/api/documenti/${d.id}?scarica=1`} className="text-xs text-neutral-700 underline">scarica</a>
                    <form action={spostaDocumento} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={d.id} />
                      <select name="cartella" defaultValue={d.cartella} className="text-xs border border-neutral-300 rounded px-1">{cartelle.map((x) => <option key={x}>{x}</option>)}</select>
                      <button className="text-xs text-neutral-700 underline">sposta</button>
                    </form>
                    {(u.ruolo === "AMMINISTRATORE" || d.caricatoDaNome === u.nome) && (
                      <form action={eliminaDocumento} className="inline"><input type="hidden" name="id" value={d.id} /><button className="text-xs text-red-700 underline">elimina</button></form>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
      <CaricaDocumenti entita={entita} entitaId={entitaId} cartelle={cartelle} />
    </section>
  );
}
