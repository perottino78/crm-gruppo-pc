export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { UFFICI, STATI_CHIUSI, nomeUfficio } from "@/lib/flusso";
import { numeroCommessa } from "@/lib/commesse";
import TaskCard from "@/components/TaskCard";
import { assicuraFlusso } from "@/app/flusso-actions";
import { completaTaskCliente } from "@/app/task-clienti-actions";

export default async function TaskPage({ searchParams }: { searchParams: Promise<{ ufficio?: string; vista?: string }> }) {
  const sp = await searchParams;
  const u = await getCurrentUser();
  await assicuraFlusso();
  const admin = isAmministratore(u);
  const ufficio = sp.ufficio ?? (u?.ufficio && !admin ? u.ufficio : u?.ufficio ?? "TUTTI");
  const vista = sp.vista ?? "aperti";
  const tasks = await prisma.taskPratica.findMany({
    where: {
      ...(ufficio !== "TUTTI" ? { ufficio } : {}),
      ...(vista === "aperti" ? { stato: { notIn: STATI_CHIUSI } } : vista === "chiusi" ? { stato: { in: STATI_CHIUSI } } : {}),
    },
    include: { commessa: { include: { cliente: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  // task dati dalla scheda cliente: i miei da fare e quelli che ho dato ai colleghi (ancora aperti)
  const [mieiClienti, datiDaMe] = u ? await Promise.all([
    prisma.attivita.findMany({ where: { tipo: "TASK", completata: false, utenteId: u.id }, include: { cliente: { select: { id: true, nome: true } } }, orderBy: [{ scadenza: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 100 }),
    prisma.attivita.findMany({ where: { tipo: "TASK", completata: false, creatoDaId: u.id, NOT: { utenteId: u.id } }, include: { cliente: { select: { id: true, nome: true } }, utente: { select: { nome: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]) : [[], []];
  const adesso = new Date();
  const link = (uff: string, v: string) => `/task?ufficio=${uff}&vista=${v}`;
  const pill = (on: boolean) => `px-3 py-1.5 rounded-md text-xs font-bold border ${on ? "bg-blue-700 text-white border-blue-700" : "bg-white text-neutral-800 border-neutral-300"}`;
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-extrabold text-neutral-900 mb-1">✅ Task pratiche</h1>
      <p className="text-sm text-neutral-700 mb-4">
        Quando un ufficio preme <b>Fatto</b>, la pratica passa in automatico all&apos;ufficio successivo con il suo task già pronto.
        {u?.ufficio && <> Il tuo ufficio: <b>{nomeUfficio(u.ufficio)}</b>.</>}
      </p>
      <section id="task-clienti" className="mb-6 rounded-xl border border-amber-300 bg-amber-50/50 p-3 md:p-4">
        <h2 className="text-base font-extrabold text-neutral-900">📌 I miei task sui clienti ({mieiClienti.length})</h2>
        <p className="mb-2 text-xs text-neutral-600">Dati dalla scheda di un cliente (pulsante «✅ Task»): da te o da un collega.</p>
        {mieiClienti.length === 0 ? <p className="text-sm text-neutral-600">Nessun task da fare.</p> : (
          <div className="divide-y divide-amber-100 rounded-lg border border-amber-200 bg-white">
            {mieiClienti.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <b>{t.oggetto}</b> · <Link href={`/clienti/${t.cliente.id}?sez=task`} className="text-blue-700 underline">{t.cliente.nome}</Link>
                  {t.scadenza && <span className={`text-xs ${t.scadenza < adesso ? "font-semibold text-red-700" : "text-amber-700"}`}> — entro {t.scadenza.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</span>}
                  {t.creatoDaNome && t.creatoDaId !== u?.id && <span className="text-xs text-neutral-500"> · da {t.creatoDaNome}</span>}
                  {t.descrizione && <span className="block text-xs text-neutral-600 whitespace-pre-line">{t.descrizione}</span>}
                </span>
                <form action={completaTaskCliente}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="btn-3d btn-3d-green px-3 py-1 text-xs">✓ fatto</button>
                </form>
              </div>
            ))}
          </div>
        )}
        {datiDaMe.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs font-semibold text-neutral-700">Dati da me ai colleghi, ancora da fare ({datiDaMe.length})</summary>
            <ul className="mt-1 space-y-1 text-xs text-neutral-700">
              {datiDaMe.map((t) => (
                <li key={t.id}><b>{t.oggetto}</b> · <Link href={`/clienti/${t.cliente.id}?sez=task`} className="underline">{t.cliente.nome}</Link> · per {t.utente?.nome ?? "—"}{t.scadenza ? ` · entro ${t.scadenza.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : ""}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <div className="flex flex-wrap gap-2 mb-2">
        <Link href={link("TUTTI", vista)} className={pill(ufficio === "TUTTI")}>Tutti gli uffici</Link>
        {UFFICI.map((x) => <Link key={x.chiave} href={link(x.chiave, vista)} className={pill(ufficio === x.chiave)}>{x.nome}</Link>)}
      </div>
      <div className="flex gap-2 mb-4">
        {[["aperti", "Aperti"], ["chiusi", "Chiusi"], ["tutti", "Tutti"]].map(([k, n]) => <Link key={k} href={link(ufficio, k)} className={pill(vista === k)}>{n}</Link>)}
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-neutral-600 bg-white border border-neutral-200 rounded-lg p-4">Nessun task {vista === "aperti" ? "aperto" : ""} per questa selezione.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} pratica={{ numero: numeroCommessa(t.commessa), cliente: t.commessa.cliente.nome }} />
          ))}
        </div>
      )}
    </div>
  );
}
