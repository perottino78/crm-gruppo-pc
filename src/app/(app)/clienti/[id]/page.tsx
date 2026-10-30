export const dynamic = "force-dynamic";

import FormAppuntamento from "@/components/calendario/FormAppuntamento";
import { nomeTipoAppuntamento, vedeTutti } from "@/lib/calendario/eventi";
import { aggiungiGiorni, chiaveGiorno } from "@/lib/calendario/tempo";
import { mailConfigurata } from "@/lib/mail/invio";
import { prisma } from "@/lib/prisma";
import Documenti from "@/components/documenti/Documenti";
import DocumentiCorrelati from "@/components/documenti/DocumentiCorrelati";
import { correlatiCliente } from "@/lib/documenti/correlati";
import { creaAttivita, completaAttivita, creaPreventivo } from "@/app/actions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { scopeClienteWhere } from "@/lib/scope";
import SchedaClienteTabs from "@/components/SchedaClienteTabs";
import PraticaCard from "@/components/clienti/PraticaCard";
import TaskCard from "@/components/TaskCard";
import { praticheCliente, diarioCliente } from "@/lib/clienti/scheda";
import { STATI_CHIUSI, nomeUfficio } from "@/lib/flusso";
import { eur } from "@/lib/commesse";
import { statoOrdine } from "@/lib/ordini/calcoli";

const TIPI = [
  { v: "NOTA", label: "Nota", icon: "📝" },
  { v: "CHIAMATA", label: "Chiamata", icon: "📞" },
  { v: "EMAIL", label: "Email", icon: "✉️" },
  { v: "TASK", label: "Task / scadenza", icon: "✅" },
];

type Sezione = "pratiche" | "attivita" | "task" | "appuntamenti" | "acquisti" | "file" | "anagrafica";

const iniziali = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

export default async function SchedaClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sez?: string; chiuse?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const utenteCorrente = await getCurrentUser();
  const utentiCal = await prisma.utente.findMany({ where: { passwordHash: { not: null } }, select: { id: true, nome: true }, orderBy: { nome: "asc" } });
  if (!utenteCorrente) notFound();

  const cliente = await prisma.cliente.findFirst({
    where: { id, ...scopeClienteWhere(utenteCorrente) },
    include: {
      brand: true,
      leadOrigine: true,
      responsabile: true,
      appuntamenti: { include: { utente: true }, orderBy: { dataOra: "desc" } },
      attivita: { include: { utente: true }, orderBy: { dataOra: "desc" } },
      referenti: { orderBy: { createdAt: "desc" } },
      indirizziAltri: { orderBy: { createdAt: "desc" } },
      correlazioniDa: { include: { correlato: true }, orderBy: { createdAt: "desc" } },
      correlazioniA: { include: { cliente: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!cliente) notFound();

  const dati = await praticheCliente(utenteCorrente, cliente.id);
  const { pratiche, commesse, ordini, vediAcquisti } = dati;

  const taskCommesse = commesse.filter((c) => !["CHIUSA", "LAVORI_ESEGUITI", "ANNULLATA"].includes(c.stato)).flatMap((c) => c.tasks.filter((t) => !STATI_CHIUSI.includes(t.stato)).map((t) => ({ t, c })));
  const taskAttivita = cliente.attivita.filter((a) => a.tipo === "TASK" && !a.completata);
  const offerteAperte = pratiche.filter((p) => p.esito === "TRATTATIVA");
  const inCorso = pratiche.filter((p) => p.esito === "IN_CORSO");
  const attive = pratiche.filter((p) => p.esito === "IN_CORSO" || p.esito === "TRATTATIVA");
  const chiuse = pratiche.filter((p) => !(p.esito === "IN_CORSO" || p.esito === "TRATTATIVA"));
  const nTask = taskCommesse.length + taskAttivita.length;

  const sezioniTutte: { id: Sezione; label: string; n?: number; colore: string; visibile: boolean }[] = [
    { id: "pratiche", label: "Offerte e pratiche", n: pratiche.length, colore: "bg-blue-600", visibile: true },
    { id: "attivita", label: "Attività recenti", colore: "bg-slate-500", visibile: true },
    { id: "task", label: "Task", n: nTask, colore: "bg-amber-500", visibile: true },
    { id: "appuntamenti", label: "Appuntamenti", n: cliente.appuntamenti.length, colore: "bg-pink-600", visibile: true },
    { id: "acquisti", label: "Ordini e bolle", n: ordini.length, colore: "bg-purple-600", visibile: vediAcquisti },
    { id: "file", label: "File", n: dati.fileTotali, colore: "bg-red-700", visibile: true },
    { id: "anagrafica", label: "Anagrafica", colore: "bg-teal-600", visibile: true },
  ];
  const sezioni = sezioniTutte.filter((s) => s.visibile);
  const sez: Sezione = (sezioni.find((s) => s.id === sp.sez)?.id ?? "pratiche") as Sezione;
  const href = (s: Sezione) => (s === "pratiche" ? `/clienti/${cliente.id}` : `/clienti/${cliente.id}?sez=${s}`);

  const indirizzo = [cliente.indirizzo, [cliente.cap, cliente.comune].filter(Boolean).join(" "), cliente.provincia && `(${cliente.provincia})`]
    .filter(Boolean)
    .join(" ");
  const telefono = cliente.cellulare || cliente.telefono;

  return (
    <div className="max-w-6xl">
      <Link href="/clienti" className="text-xs text-neutral-600 hover:underline">← Clienti</Link>

      {/* ── Testata ─────────────────────────────────────────────── */}
      <section className="mt-2 bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-teal-500 to-amber-400" />
        <div className="p-5 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-neutral-900 text-white flex items-center justify-center text-xl font-black tracking-tight">
              {iniziali(cliente.nome)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black text-neutral-900 tracking-tight">{cliente.nome}</h1>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-900 text-white font-semibold">{cliente.brand.nome}</span>
                {cliente.leadOrigine && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold">lead {cliente.leadOrigine.fonte}</span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-700">
                {telefono && <a href={`tel:${telefono}`} className="hover:underline">📞 {telefono}</a>}
                {cliente.email && <a href={`mailto:${cliente.email}`} className="hover:underline">✉️ {cliente.email}</a>}
                {indirizzo && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzo)}`}
                    target="_blank"
                    className="hover:underline"
                  >
                    📍 {indirizzo}
                  </a>
                )}
                {cliente.responsabile && <span>👤 {cliente.responsabile.nome}</span>}
              </div>
            </div>
          </div>

        </div>

        {/* azioni rapide: pulsanti grandi 3D */}
        <div className="px-4 pb-4 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {[
            { ico: "➕", t: "Nuova offerta", h: `${href("pratiche")}#nuova-offerta`, c: "btn-3d-green" },
            { ico: "📝", t: "Nota / chiamata", h: `${href("attivita")}#nuova-attivita`, c: "btn-3d-blue" },
            { ico: "📅", t: "Appuntamento", h: `${href("appuntamenti")}#nuovo-appuntamento`, c: "btn-3d-purple" },
            { ico: "✅", t: "Task", h: href("task"), c: "btn-3d-amber" },
            { ico: "📎", t: "Carica file", h: href("file"), c: "btn-3d-teal" },
            { ico: "📞", t: "Chiama", h: telefono ? `tel:${telefono}` : null, c: "btn-3d-dark" },
            { ico: "✉️", t: "Email", h: cliente.email ? `mailto:${cliente.email}` : null, c: "btn-3d-pink" },
            { ico: "📍", t: "Naviga", h: indirizzo ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(indirizzo)}` : null, c: "btn-3d-orange" },
            { ico: "✎", t: "Anagrafica", h: href("anagrafica"), c: "btn-3d-outline" },
          ].map((b) =>
            b.h ? (
              <a key={b.t} href={b.h} target={b.h.startsWith("https://") ? "_blank" : undefined} className={`btn-3d tile-3d ${b.c}`}>
                <span className="text-xl leading-none">{b.ico}</span>
                <span>{b.t}</span>
              </a>
            ) : (
              <span key={b.t} className="btn-3d tile-3d btn-3d-outline opacity-40 cursor-not-allowed" title="dato mancante in anagrafica">
                <span className="text-xl leading-none">{b.ico}</span>
                <span>{b.t}</span>
              </span>
            ),
          )}
        </div>

        {/* indicatori */}
        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-neutral-100 divide-x divide-neutral-100">
          {[
            { label: "Offerte aperte", valore: `${offerteAperte.length}`, sotto: eur(offerteAperte.reduce((s, p) => s + p.totale, 0)), s: "pratiche" as Sezione, c: "text-amber-600" },
            { label: "Pratiche in corso", valore: `${inCorso.length}`, sotto: eur(inCorso.reduce((s, p) => s + p.totale, 0)), s: "pratiche" as Sezione, c: "text-blue-700" },
            { label: "Da fare", valore: `${nTask}`, sotto: nTask ? "task aperti" : "nessun task", s: "task" as Sezione, c: nTask ? "text-red-600" : "text-neutral-400" },
            { label: "File", valore: `${dati.fileTotali}`, sotto: "cliente e pratiche", s: "file" as Sezione, c: "text-neutral-800" },
          ].map((k) => (
            <Link key={k.label} href={href(k.s)} className="px-5 py-3 hover:bg-neutral-50">
              <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">{k.label}</p>
              <p className={`text-2xl font-black tabular-nums ${k.c}`}>{k.valore}</p>
              <p className="text-xs text-neutral-500 tabular-nums">{k.sotto}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Prossima azione ─────────────────────────────────────── */}
      {nTask === 0 && attive.length > 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-red-300 bg-red-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-red-800">⚠ Nessuna azione pianificata per le pratiche aperte</p>
          <Link href={`${href("attivita")}#nuova-attivita`} className="btn-3d btn-3d-outline text-xs px-3 py-1.5">+ Pianifica la prossima attività</Link>
        </div>
      ) : nTask > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Prossime azioni</p>
            <Link href={href("task")} className="text-xs font-semibold text-amber-900 underline">tutti i task ({nTask})</Link>
          </div>
          <ul className="mt-1 space-y-0.5">
            {taskCommesse.slice(0, 3).map(({ t, c }) => (
              <li key={t.id} className="text-sm text-neutral-800">
                <strong className="text-amber-900">{nomeUfficio(t.ufficio)}</strong> · {t.titolo}{" "}
                <Link href={`/commesse/${c.id}`} className="text-xs text-blue-700 underline">{c.numeroTxt}</Link>
              </li>
            ))}
            {taskAttivita.slice(0, Math.max(0, 3 - taskCommesse.length)).map((t) => (
              <li key={t.id} className="text-sm text-neutral-800">
                <strong className="text-amber-900">Task</strong> · {t.oggetto}
                {t.scadenza && <span className="text-xs text-amber-700"> — entro {t.scadenza.toLocaleDateString("it-IT")}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── Barra sezioni (stile Bconsole) ──────────────────────── */}
      <nav className="mt-5 flex flex-wrap gap-1.5 sticky top-0 z-10 bg-white/90 backdrop-blur py-2">
        {sezioni.map((s) => {
          const attiva = s.id === sez;
          return (
            <Link
              key={s.id}
              href={href(s.id)}
              scroll={false}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                attiva ? `${s.colore} text-white shadow-md` : "bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-400"
              }`}
            >
              {!attiva && <span className={`w-2 h-2 rounded-full ${s.colore}`} />}
              {s.label}
              {s.n !== undefined && (
                <span className={`text-[11px] px-1.5 rounded-full ${attiva ? "bg-white/25" : "bg-neutral-100 text-neutral-600"}`}>{s.n}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 mb-10">
        {/* ── Offerte e pratiche ── */}
        {sez === "pratiche" && (
          <div className="space-y-4">
            <details id="nuova-offerta" className="bg-white rounded-xl border border-neutral-200 group">
              <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-neutral-900">+ Nuova offerta per {cliente.nome}</span>
                <span className="text-xs text-neutral-500 group-open:hidden">apri</span>
              </summary>
              <form action={creaPreventivo} className="px-4 pb-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="clienteId" value={cliente.id} />
                <div className="flex gap-3 flex-wrap">
                  {(await prisma.brand.findMany({ orderBy: { nome: "asc" } })).map((b) => (
                    <label key={b.id} className="text-sm inline-flex items-center gap-1 border border-neutral-200 rounded-lg px-2.5 py-1.5 has-[:checked]:border-green-600 has-[:checked]:bg-green-50">
                      <input type="radio" name="brandId" value={b.id} defaultChecked={b.id === cliente.brandId} required />
                      {b.nome}
                    </label>
                  ))}
                </div>
                <select name="commercialeId" required className="border border-neutral-200 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">Commerciale…</option>
                  {(await prisma.utente.findMany({ where: { ruolo: "COMMERCIALE" }, orderBy: { nome: "asc" } })).map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
                <button className="btn-3d btn-3d-green text-sm px-4 py-2">Apri offerta →</button>
              </form>
            </details>

            {attive.map((p) => <PraticaCard key={p.id} p={p} vediAcquisti={vediAcquisti} />)}
            {attive.length === 0 && (
              <p className="text-sm text-neutral-500 bg-white rounded-xl border border-neutral-200 px-4 py-6 text-center">
                Nessuna offerta aperta o pratica in corso per questo cliente.
              </p>
            )}

            {chiuse.length > 0 && (
              <details open={sp.chiuse === "1"} className="rounded-xl">
                <summary className="cursor-pointer text-sm font-semibold text-neutral-600 py-2">
                  Storico: offerte concluse, non accettate o annullate ({chiuse.length})
                </summary>
                <div className="space-y-4 mt-2 opacity-90">
                  {chiuse.map((p) => <PraticaCard key={p.id} p={p} vediAcquisti={vediAcquisti} />)}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ── Attività recenti ── */}
        {sez === "attivita" && (
          <div className="space-y-4">
            <form id="nuova-attivita" action={creaAttivita} className="bg-white rounded-xl border border-neutral-200 p-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="clienteId" value={cliente.id} />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-700">Tipo</label>
                <select name="tipo" defaultValue="NOTA" className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
                  {TIPI.map((t) => <option key={t.v} value={t.v}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                <label className="text-xs text-neutral-700">Oggetto</label>
                <input name="oggetto" required placeholder="es. Chiamato per confermare misure" className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-full" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-700">Scadenza (solo task)</label>
                <input name="scadenza" type="date" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-700">Chi</label>
                <select name="utenteId" className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  {(await prisma.utente.findMany({ orderBy: { nome: "asc" } })).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 w-full">
                <label className="text-xs text-neutral-700">Note</label>
                <textarea name="descrizione" rows={2} className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-full" />
              </div>
              <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Registra attività</button>
            </form>

            <div className="bg-white rounded-xl border border-neutral-200 px-4 py-3">
              <h2 className="text-base font-bold text-neutral-900 mb-2">Attività recenti</h2>
              <ol className="relative border-l-2 border-neutral-100 ml-2">
                {diarioCliente({ attivita: cliente.attivita, appuntamenti: cliente.appuntamenti, pratiche, commesse: commesse.map((c) => ({ ...c })) })
                  .slice(0, 80)
                  .map((v, i) => (
                    <li key={i} className="ml-4 py-1.5">
                      <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full border-2 border-white" style={{ background: v.colore }} />
                      <div className="flex flex-wrap items-baseline gap-2 text-sm">
                        <span className="text-xs text-neutral-500 tabular-nums w-[92px] shrink-0">
                          {v.data.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })}{" "}
                          {v.data.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide font-bold px-1.5 py-px rounded text-white" style={{ background: v.colore }}>{v.tipo}</span>
                        {v.link ? <Link href={v.link} className="text-neutral-900 hover:underline">{v.testo}</Link> : <span className="text-neutral-900">{v.testo}</span>}
                        {v.chi && <span className="text-xs text-neutral-500">· {v.chi}</span>}
                      </div>
                    </li>
                  ))}
              </ol>
              {cliente.attivita.length + pratiche.length + cliente.appuntamenti.length === 0 && (
                <p className="text-sm text-neutral-500 py-4">Nessuna attività registrata ancora.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Task ── */}
        {sez === "task" && (
          <div className="space-y-3">
            {taskAttivita.length > 0 && (
              <div className="bg-white rounded-xl border border-neutral-200 p-4">
                <h2 className="text-sm font-bold text-neutral-900 mb-2">Promemoria sul cliente ({taskAttivita.length})</h2>
                {taskAttivita.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm py-1.5 border-b border-neutral-50 last:border-0">
                    <span>
                      {t.oggetto}
                      {t.scadenza && <span className="text-xs text-amber-700"> — scadenza {t.scadenza.toLocaleDateString("it-IT")}</span>}
                      {t.utente && <span className="text-xs text-neutral-500"> · {t.utente.nome}</span>}
                    </span>
                    <form action={completaAttivita}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="clienteId" value={cliente.id} />
                      <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">✓ fatto</button>
                    </form>
                  </div>
                ))}
              </div>
            )}
            {taskCommesse.map(({ t, c }) => (
              <TaskCard key={t.id} task={t} pratica={{ numero: c.numeroTxt, cliente: cliente.nome }} />
            ))}
            {nTask === 0 && (
              <p className="text-sm text-neutral-500 bg-white rounded-xl border border-neutral-200 px-4 py-6 text-center">Nessun task aperto per questo cliente.</p>
            )}
          </div>
        )}

        {/* ── Appuntamenti ── */}
        {sez === "appuntamenti" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100">
              {[
                ...cliente.appuntamenti.map((a) => ({ id: a.id, data: a.dataOra, titolo: a.titolo || nomeTipoAppuntamento(a.tipo), chi: a.utente.nome, stato: a.stato, link: `/calendario/appuntamento/${a.id}`, esito: a.esito })),
                ...commesse.flatMap((c) => c.rilievi.map((r) => ({ id: r.id, data: r.dataOra, titolo: `Rilievo misure · ${c.numeroTxt}`, chi: null as string | null, stato: r.stato, link: `/commesse/${c.id}`, esito: null as string | null }))),
              ]
                .sort((a, b) => b.data.getTime() - a.data.getTime())
                .map((a) => (
                  <Link key={a.id} href={a.link} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm hover:bg-neutral-50">
                    <span>
                      <strong className="tabular-nums">{a.data.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "medium", timeStyle: "short" })}</strong> · <span className="underline">{a.titolo}</span>
                      {a.chi && <span className="text-neutral-500"> · {a.chi}</span>}
                      {a.esito && <span className="block text-xs text-neutral-600">esito: {a.esito}</span>}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">{a.stato.toLowerCase()}</span>
                  </Link>
                ))}
              {cliente.appuntamenti.length === 0 && commesse.every((c) => c.rilievi.length === 0) && (
                <p className="px-4 py-6 text-sm text-neutral-500 text-center">Nessun appuntamento.</p>
              )}
            </div>
            <section id="nuovo-appuntamento" className="card-fase scroll-mt-4" style={{ "--fase": "#7c3aed" } as React.CSSProperties}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2>📅 Fissa un appuntamento con {cliente.nome}</h2>
                <Link href={`/calendario?cliente=${cliente.id}#nuovo`} className="text-xs font-bold text-blue-800 underline">guarda prima il calendario →</Link>
              </div>
              <FormAppuntamento
                utenti={utentiCal} utenteId={cliente.responsabileId ?? utenteCorrente!.id} puoAssegnare={vedeTutti(utenteCorrente!.ruolo)}
                data={`${aggiungiGiorni(chiaveGiorno(new Date()), 1)}T09:00`}
                cliente={{ id: cliente.id, nome: cliente.nome, email: cliente.email }} ritorno={`/clienti/${cliente.id}?sez=appuntamenti`} mailAttiva={mailConfigurata()}
              />
            </section>
          </div>
        )}

        {/* ── Ordini e bolle ── */}
        {sez === "acquisti" && vediAcquisti && (
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-600">
                <tr><th className="text-left px-4 py-2">Ordine</th><th className="text-left px-2">Fornitore</th><th className="text-left px-2">Commessa</th><th className="text-left px-2">Data</th><th className="text-left px-2">Stato</th></tr>
              </thead>
              <tbody>
                {ordini.map((o) => {
                  const st = statoOrdine(o.stato);
                  const c = commesse.find((x) => x.id === o.commessaId);
                  return (
                    <tr key={o.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                      <td className="px-4 py-2 font-semibold"><Link href={`/ordini-fornitori/${o.id}`} className="underline">{o.numero}/{o.anno}</Link></td>
                      <td className="px-2">{o.fornitore.ragioneSociale}</td>
                      <td className="px-2">{c && <Link href={`/commesse/${c.id}`} className="text-blue-700 underline">{c.numeroTxt}</Link>}</td>
                      <td className="px-2 tabular-nums">{o.dataOrdine.toLocaleDateString("it-IT")}</td>
                      <td className="px-2"><span className="text-[11px] px-2 py-0.5 rounded text-white font-semibold" style={{ background: st.colore }}>{st.nome}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {ordini.length === 0 && <p className="px-4 py-6 text-sm text-neutral-500 text-center">Nessun ordine fornitore sulle pratiche di questo cliente.</p>}
            <p className="px-4 py-2 text-xs text-neutral-500 border-t border-neutral-100">Bolle e fatture dei fornitori collegate sono nella sezione File e nella scheda di ogni commessa.</p>
          </div>
        )}

        {/* ── File ── */}
        {sez === "file" && (
          <div>
            <Documenti entita="CLIENTE" entitaId={cliente.id} titolo="Documenti del cliente" />
            <DocumentiCorrelati
              gruppi={(await correlatiCliente(utenteCorrente, cliente.id)).filter((g) => g.entita !== "CLIENTE")}
              titolo="Documenti delle pratiche (offerte, commesse, ordini, bolle, fatture)"
            />
          </div>
        )}

        {/* ── Anagrafica ── */}
        {sez === "anagrafica" && (
          <SchedaClienteTabs
            cliente={cliente}
            utenti={await prisma.utente.findMany({ orderBy: { nome: "asc" } })}
            altriClienti={await prisma.cliente.findMany({
              where: { id: { not: cliente.id } },
              select: { id: true, nome: true, comune: true },
              orderBy: { nome: "asc" },
              take: 500,
            })}
          />
        )}
      </div>
    </div>
  );
}
