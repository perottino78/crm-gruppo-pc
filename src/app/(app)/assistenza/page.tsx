import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { numeroCommessa } from "@/lib/commesse";
import { aggiornaAssistenza } from "@/app/commesse-actions";

export const dynamic = "force-dynamic";
const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";
const STATI = ["APERTA", "PROGRAMMATA", "IN_ATTESA_RICAMBIO", "RISOLTA", "ANNULLATA"];

export default async function AssistenzaPage({ searchParams }: { searchParams: Promise<{ stato?: string }> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const { stato } = await searchParams;
  const [lista, utenti] = await Promise.all([
    prisma.assistenza.findMany({
      where: stato === "TUTTE" ? {} : stato ? { stato } : { stato: { in: ["APERTA", "PROGRAMMATA", "IN_ATTESA_RICAMBIO"] } },
      include: { commessa: { include: { cliente: true } } },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.utente.findMany({ orderBy: { nome: "asc" } }),
  ]);
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Assistenza</h1>
      <p className="text-xs text-neutral-600 mb-3">Le richieste si aprono dalla scheda della commessa.</p>
      <div className="flex gap-2 mb-4 text-xs">
        <Link href="/assistenza" className="underline text-blue-800">aperte</Link>
        {STATI.map((s) => <Link key={s} href={`/assistenza?stato=${s}`} className="underline text-blue-800">{s}</Link>)}
        <Link href="/assistenza?stato=TUTTE" className="underline text-blue-800">tutte</Link>
      </div>
      <div className="space-y-3">
        {lista.map((a) => (
          <div key={a.id} className="card-fase" style={{ "--fase": "#db2777" } as React.CSSProperties}>
            <p className="text-sm text-neutral-900">
              <b>#{a.numero}</b> · <Link href={`/commesse/${a.commessaId}`} className="underline text-blue-800">{numeroCommessa(a.commessa)} {a.commessa.cliente.nome}</Link>
              {" · "}{a.prodotto ? a.prodotto + " · " : ""}{a.descrizione}
              <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded ${a.priorita === "URGENTE" ? "bg-red-200" : "bg-neutral-200"}`}>{a.priorita}</span>
              <span className={`ml-1 text-xs px-2 py-0.5 rounded ${a.inGaranzia ? "bg-green-100" : "bg-amber-200"}`}>{a.inGaranzia ? "in garanzia" : "fuori garanzia"}</span>
            </p>
            <form action={aggiornaAssistenza} className="flex flex-wrap items-end gap-2 mt-2">
              <input type="hidden" name="id" value={a.id} />
              <select name="stato" defaultValue={a.stato} className={inp}>{STATI.map((s) => <option key={s}>{s}</option>)}</select>
              <select name="assegnatoUtenteId" defaultValue={a.assegnatoUtenteId ?? ""} className={inp}>
                <option value="">Tecnico…</option>
                {utenti.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
              <input type="datetime-local" name="dataIntervento" defaultValue={a.dataIntervento ? a.dataIntervento.toISOString().slice(0, 16) : ""} className={inp} />
              <input name="ricambioNote" defaultValue={a.ricambioNote ?? ""} placeholder="Ricambio / ordine fornitore" className={`${inp} w-52`} />
              <input name="esito" defaultValue={a.esito ?? ""} placeholder="Esito intervento" className={`${inp} w-52`} />
              <input name="costo" defaultValue={a.costo ?? ""} placeholder="Costo €" className={`${inp} w-24`} />
              <button className="btn-3d btn-3d-green text-sm px-4 py-2">Salva</button>
            </form>
          </div>
        ))}
        {lista.length === 0 && <p className="text-sm text-neutral-600">Nessuna assistenza.</p>}
      </div>
    </div>
  );
}
