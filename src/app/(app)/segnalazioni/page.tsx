export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { destinatarioAssistenza, gestisceSegnalazioni } from "@/lib/segnalazioni/server";
import { risolviSegnalazione, riapriSegnalazione } from "@/app/segnalazioni-actions";

// Assistenza interna: chi la segue (Rocco) e gli amministratori vedono tutte le segnalazioni del team; gli altri le proprie.
export default async function SegnalazioniPage({ searchParams }: { searchParams: Promise<{ fatto?: string; errore?: string; chiuse?: string }> }) {
  const sp = await searchParams;
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const dest = await destinatarioAssistenza();
  const gestisce = gestisceSegnalazioni(u, dest?.id);
  const tutte = await prisma.segnalazione.findMany({
    where: gestisce ? {} : { autoreId: u.id },
    include: { allegati: { select: { id: true, nome: true, mime: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const aperte = tutte.filter((s) => s.stato === "APERTA");
  const chiuse = tutte.filter((s) => s.stato !== "APERTA");
  const data = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "medium", timeStyle: "short" });

  const Scheda = ({ s }: { s: (typeof tutte)[number] }) => (
    <article id={`s-${s.id}`} className={`scroll-mt-4 rounded-xl border bg-white p-4 ${s.stato === "APERTA" ? "border-red-200" : "border-neutral-200 opacity-90"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-neutral-900">{gestisce ? s.autoreNome : "Tu"} <span className="font-normal text-neutral-500">· {data(s.createdAt)}</span></p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.stato === "APERTA" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>{s.stato === "APERTA" ? "da guardare" : "✓ risolta"}</span>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm text-neutral-900">{s.testo}</p>
      {s.pagina && <p className="mt-1 truncate text-xs">📍 <a href={s.pagina} className="text-blue-700 underline">{s.pagina.replace(/^https?:\/\/[^/]+/, "") || "/"}</a></p>}
      {s.allegati.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {s.allegati.map((a) => (
            <a key={a.id} href={`/api/segnalazioni/allegato/${a.id}`} target="_blank" rel="noreferrer" title={a.nome}>
              {a.mime.startsWith("image/")
                ? <img src={`/api/segnalazioni/allegato/${a.id}`} alt={a.nome} className="h-28 w-44 rounded border border-neutral-200 object-cover object-top hover:opacity-90" />
                : <span className="flex h-28 w-44 items-center justify-center rounded border border-neutral-200 bg-neutral-50 text-xs">📄 {a.nome}</span>}
            </a>
          ))}
        </div>
      )}
      {s.stato !== "APERTA" && (
        <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-900">
          ✓ Risolta{s.risoltaDaNome ? ` da ${s.risoltaDaNome}` : ""}{s.risoltaIl ? ` il ${data(s.risoltaIl)}` : ""}{s.risposta ? <><br /><span className="whitespace-pre-line text-sm">{s.risposta}</span></> : null}
        </p>
      )}
      {gestisce && s.stato === "APERTA" && (
        <form action={risolviSegnalazione} className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
          <input type="hidden" name="id" value={s.id} />
          <label className="min-w-0 flex-1 text-xs font-semibold text-neutral-700">Risposta per {s.autoreNome.split(" ")[0]} (facoltativa, gli arriva via email)
            <textarea name="risposta" rows={2} placeholder="es. sistemato: ricarica la pagina e riprova" className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
          </label>
          <button className="btn-3d btn-3d-green px-4 py-2 text-sm">✓ Risolta</button>
        </form>
      )}
      {gestisce && s.stato !== "APERTA" && (
        <form action={riapriSegnalazione} className="mt-2"><input type="hidden" name="id" value={s.id} /><button className="text-xs text-neutral-600 underline">riapri</button></form>
      )}
    </article>
  );

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-black text-neutral-900">🆘 {gestisce ? "Segnalazioni del team" : "Le mie segnalazioni"}</h1>
        <p className="text-sm text-neutral-600">
          {gestisce
            ? <>Arrivano dal pulsante «🆘 Segnala un problema» in basso nel menu{dest ? <>, a <b>{dest.nome}</b> con l&apos;amministratore in copia</> : null}. Con «✓ Risolta» la risposta arriva via email a chi ha scritto.</>
            : <>Le segnalazioni che hai mandato con «🆘 Segnala un problema» (in basso nel menu) e le risposte di {dest?.nome ?? "chi segue l'assistenza"}.</>}
        </p>
      </div>
      {sp.fatto && <p className="rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-900">✅ {sp.fatto}</p>}
      {sp.errore && <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">{sp.errore}</p>}
      <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-600">Da guardare ({aperte.length})</h2>
      {aperte.length === 0 ? <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-600">Nessuna segnalazione aperta. 👍</p> : aperte.map((s) => <Scheda key={s.id} s={s} />)}
      {chiuse.length > 0 && (
        <details open={sp.chiuse === "1"}>
          <summary className="cursor-pointer text-sm font-bold uppercase tracking-wide text-neutral-600">Risolte ({chiuse.length})</summary>
          <div className="mt-3 space-y-3">{chiuse.map((s) => <Scheda key={s.id} s={s} />)}</div>
        </details>
      )}
    </div>
  );
}
