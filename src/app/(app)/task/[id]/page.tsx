export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoVedereTask } from "@/lib/task/permessi";
import { CATEGORIE_TASK, STATI_TASK_CLIENTE, statoMostrato } from "@/lib/task/categorie";
import { soloAttivi } from "@/lib/utenti/stato";
import { perInput } from "@/lib/calendario/tempo";
import { commentaTask, salvaDescrizioneTask, salvaInfoTask } from "@/app/task-actions";
import ElencoCommenti from "@/components/task/ElencoCommenti";
import Documenti from "@/components/documenti/Documenti";

const TAB = [["descrizione", "Descrizione"], ["commenti", "Commenti"], ["file", "File"], ["info", "Info sul task"]] as const;
const inp = "w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

/** Task come corrispondenza interna: descrizione, commenti, file e info (assegnato, in copia, stato, categoria, ore, scadenza). */
export default async function TaskDettaglio({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ok?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u) notFound();
  const { id } = await params;
  const sp = await searchParams;
  if (!(await puoVedereTask(u, id))) notFound();
  const t = await prisma.attivita.findUnique({
    where: { id },
    include: { cliente: { select: { id: true, nome: true } }, utente: { select: { id: true, nome: true } }, commenti: { orderBy: { createdAt: "asc" } } },
  });
  if (!t || t.tipo !== "TASK") notFound();
  const tab = TAB.some(([k]) => k === sp.tab) ? sp.tab! : "descrizione";
  const [utenti, nFile] = await Promise.all([
    prisma.utente.findMany({ where: { stato: { in: ["ATTIVO"] } }, select: { id: true, nome: true, ufficio: true, stato: true }, orderBy: { nome: "asc" } }),
    prisma.documento.count({ where: { entita: "TASK", entitaId: id } }),
  ]);
  const incaricati = soloAttivi(utenti as never[], t.utenteId as never) as typeof utenti;
  const stato = statoMostrato(t);
  const colore = stato.chiave === "FATTO" ? "bg-green-100 text-green-900" : stato.chiave === "SCADUTA" ? "bg-red-100 text-red-800" : stato.chiave === "IN_CORSO" ? "bg-blue-100 text-blue-900" : "bg-amber-100 text-amber-900";
  const nomeUtente = (uid: string) => utenti.find((x) => x.id === uid)?.nome ?? "—";
  return (
    <div className="max-w-4xl">
      <Link href="/task" className="btn-indietro">← Task</Link>
      <div className="mb-3 mt-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold uppercase text-neutral-900">{t.oggetto}</h1>
          <p className="text-xs text-neutral-600">Creato da <b>{t.creatoDaNome ?? "—"}</b> il {t.createdAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })} · per <b>{t.utente?.nome ?? "—"}</b>{t.categoria ? ` · ${t.categoria}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2.5 py-1 text-xs font-extrabold uppercase ${colore}`}>{stato.nome}</span>
          <Link href={`/clienti/${t.cliente.id}`} className="rounded-full bg-neutral-100 px-4 py-1.5 text-sm font-bold text-neutral-900 hover:bg-neutral-200">🏢 {t.cliente.nome}</Link>
        </div>
      </div>
      <nav className="mb-4 flex flex-wrap gap-1 border-b border-neutral-200">
        {TAB.map(([k, n]) => (
          <Link key={k} href={`/task/${t.id}?tab=${k}`} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? "border-blue-700 text-blue-900" : "border-transparent text-neutral-600 hover:text-neutral-900"}`}>
            {n}{k === "commenti" ? ` (${t.commenti.length})` : k === "file" ? ` (${nFile})` : ""}
          </Link>
        ))}
      </nav>
      {sp.ok && <p className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {sp.ok}</p>}
      {sp.errore && <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{sp.errore}</p>}

      {tab === "descrizione" && (
        <form action={salvaDescrizioneTask} className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
          <input type="hidden" name="id" value={t.id} />
          <label className="block text-xs font-bold text-neutral-700">Titolo<input name="oggetto" defaultValue={t.oggetto} required className={inp} /></label>
          <label className="block text-xs font-bold text-neutral-700">Descrizione: cosa c&apos;è da fare<textarea name="descrizione" rows={8} defaultValue={t.descrizione ?? ""} className={inp} /></label>
          <div className="flex justify-end"><button className="btn-3d btn-3d-outline px-5 py-1.5 text-sm">Salva</button></div>
        </form>
      )}

      {tab === "commenti" && (
        <div className="space-y-4">
          <ElencoCommenti commenti={t.commenti} vuoto="Nessun commento: scrivi cosa hai fatto o cosa ti serve." />
          <form action={commentaTask} className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
            <input type="hidden" name="id" value={t.id} />
            <textarea name="testo" rows={4} placeholder="Scrivi un commento o la risposta: cosa abbiamo fatto, cosa manca…" className={inp} />
            <label className="flex items-center gap-2 text-xs text-neutral-800"><input type="checkbox" name="notifica" value="1" defaultChecked={t.notifica} /> 📧 Avvisa per email chi è coinvolto (incaricato, chi l&apos;ha creato, in copia)</label>
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn-3d btn-3d-outline px-5 py-1.5 text-sm">Commenta</button>
              {!t.completata && <button name="chiudi" value="1" className="btn-3d btn-3d-green px-5 py-1.5 text-sm">✅ Commenta e chiudi il task</button>}
            </div>
          </form>
        </div>
      )}

      {tab === "file" && (
        <Documenti entita="TASK" entitaId={t.id} titolo="File del task" />
      )}

      {tab === "info" && (
        <form action={salvaInfoTask} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          <input type="hidden" name="id" value={t.id} />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs font-bold text-neutral-700">Assegnato a
              <select name="utenteId" defaultValue={t.utenteId ?? ""} className={inp}>
                {incaricati.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-neutral-700">Stato
              <select name="statoTask" defaultValue={t.completata ? "FATTO" : t.statoTask} className={inp}>
                {STATI_TASK_CLIENTE.map((s) => <option key={s.chiave} value={s.chiave}>{s.nome}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-neutral-700">Categoria
              <select name="categoria" defaultValue={t.categoria ?? ""} className={inp}>
                <option value="">—</option>
                {CATEGORIE_TASK.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-neutral-700">Ore previste<input name="orePreviste" defaultValue={t.orePreviste ?? ""} placeholder="es. 1" className={inp} /></label>
            <label className="block text-xs font-bold text-neutral-700">Scadenza<input type="date" name="scadenza" defaultValue={t.scadenza ? perInput(t.scadenza).slice(0, 10) : ""} className={inp} /></label>
            <p className="text-xs font-bold text-neutral-700">Correlato a<span className="mt-1 block"><Link href={`/clienti/${t.cliente.id}`} className="text-blue-800 underline">{t.cliente.nome}</Link></span></p>
          </div>
          <fieldset className="rounded border border-neutral-200 p-2">
            <legend className="px-1 text-xs font-bold text-neutral-700">Coinvolti (in copia)</legend>
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 md:grid-cols-3">
              {utenti.map((x) => <label key={x.id} className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="inCopiaA" value={x.id} defaultChecked={t.inCopiaA.includes(x.id)} /> {x.nome}</label>)}
            </div>
            {t.inCopiaA.filter((x) => !utenti.some((y) => y.id === x)).map((x) => <p key={x} className="text-[11px] text-neutral-500">{nomeUtente(x)} (non più attivo)</p>)}
          </fieldset>
          <label className="flex items-center gap-2 text-xs text-neutral-800"><input type="checkbox" name="notifica" value="1" defaultChecked={t.notifica} /> 📧 Notifica: avvisa per email alla chiusura e per i commenti</label>
          <div className="flex justify-end"><button className="btn-3d btn-3d-outline px-5 py-1.5 text-sm">Salva</button></div>
        </form>
      )}
    </div>
  );
}
