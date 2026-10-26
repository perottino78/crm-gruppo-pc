// Filtri salvati dall'utente per una pagina dell'amministrazione
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { salvaVista, eliminaVista } from "@/app/amministrazione-actions";

export default async function VisteSalvate({ pagina, query }: { pagina: string; query: string }) {
  const u = await getCurrentUser();
  if (!u) return null;
  const viste = await prisma.vistaSalvata.findMany({ where: { utenteId: u.id, pagina }, orderBy: { createdAt: "asc" } });
  const q = query.replace(/^\?/, "");
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-neutral-500 font-semibold">⭐ Viste:</span>
      {viste.length === 0 && <span className="text-neutral-400">nessuna</span>}
      {viste.map((v) => (
        <span key={v.id} className={`inline-flex items-center rounded-full border ${v.query === q ? "bg-amber-100 border-amber-400" : "bg-white border-neutral-300"}`}>
          <Link href={`${pagina}${v.query ? "?" + v.query : ""}`} className="pl-2.5 pr-1 py-0.5 font-semibold text-neutral-800">{v.nome}</Link>
          <form action={eliminaVista}><input type="hidden" name="id" value={v.id} /><button className="pr-2 text-neutral-400 hover:text-red-600" title="Elimina vista">×</button></form>
        </span>
      ))}
      <details className="inline-block">
        <summary className="cursor-pointer text-neutral-600 underline list-none">+ salva filtri attuali</summary>
        <form action={salvaVista} className="flex gap-1 mt-1">
          <input type="hidden" name="pagina" value={pagina} />
          <input type="hidden" name="query" value={q} />
          <input name="nome" required maxLength={60} placeholder="Nome vista (es. Costi Solaris trimestre)" className="border border-neutral-300 rounded px-2 py-1 text-xs w-64" />
          <button className="btn-3d btn-3d-dark text-[11px] px-2">Salva</button>
        </form>
      </details>
    </div>
  );
}
