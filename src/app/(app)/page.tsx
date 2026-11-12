export const dynamic = "force-dynamic";

import { appuntamentiSenzaEsito, regoleEsiti } from "@/lib/appuntamenti/esiti-server";
import { chiaveGiorno, inizioGiorno, aggiungiGiorni } from "@/lib/calendario/tempo";
import { prisma } from "@/lib/prisma";
import BrandSwitcher from "@/components/BrandSwitcher";
import { getCurrentUser } from "@/lib/auth";
import { scopePreventivoWhere, scopeLeadWhere } from "@/lib/scope";
import { FASI_APERTE } from "@/lib/automazioni/percorsi";
import { destinatarioAssistenza, gestisceSegnalazioni } from "@/lib/segnalazioni/server";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const brandFiltro = brand && brand !== "Tutti" ? { brand: { nome: brand } } : {};
  const utente = await getCurrentUser();
  const preventivoScope = utente ? scopePreventivoWhere(utente) : {};
  const leadScope = utente ? scopeLeadWhere(utente) : {};

  const [preventiviAperti, valorePipeline, leadDaLavorare] = await Promise.all([
    prisma.preventivo.count({ where: { stato: "APERTO", ...brandFiltro, ...preventivoScope } }),
    prisma.preventivo.aggregate({ _sum: { totaleNetto: true }, where: { stato: "APERTO", ...brandFiltro, ...preventivoScope } }),
    prisma.lead.count({ where: { fase: { in: FASI_APERTE }, ...brandFiltro, ...leadScope } }),
  ]);

  // «chiamata con commerciale» fissate dal centralino per me, da fare entro oggi (il task del venditore)
  const fineOggi = inizioGiorno(aggiungiGiorni(chiaveGiorno(new Date()), 1));
  // appuntamenti miei passati ancora da esitare (promemoria del giorno dopo, regole in Impostazioni › Lead)
  const regoleEs = utente ? await regoleEsiti() : null;
  const daEsitare = utente && regoleEs ? await appuntamentiSenzaEsito({ giorni: regoleEs.giorniPromemoria, utenteId: utente.id, regole: regoleEs }) : [];
  const chiamateDaFare = utente ? await prisma.lead.count({ where: { venditoreId: utente.id, fase: "APPUNTAMENTO_TELEFONICO", scadenzaAzione: { lt: fineOggi } } }) : 0;

  // comunicazioni del team non lette o con un task ancora da fare
  const comunicazioni = utente ? await prisma.comunicazioneDestinatario.findMany({
    where: { utenteId: utente.id, OR: [{ lettaIl: null }, { fattoIl: null, comunicazione: { conTask: true } }] },
    include: { comunicazione: { select: { oggetto: true, titoloTask: true, conTask: true, mittenteNome: true } } },
    orderBy: { createdAt: "desc" }, take: 5,
  }) : [];

  // segnalazioni del team da guardare (per chi segue l'assistenza e gli amministratori)
  const segnalazioni = gestisceSegnalazioni(utente, (await destinatarioAssistenza())?.id) ? await prisma.segnalazione.count({ where: { stato: "APERTA" } }) : 0;

  // task dati dalla scheda di un cliente a me (da fare)
  const taskClienti = utente ? await prisma.attivita.count({ where: { tipo: "TASK", completata: false, utenteId: utente.id } }) : 0;

  const taskAperti = await prisma.taskPratica.count({
    where: { stato: { notIn: ["COMPLETATO", "ESEGUITO", "ANNULLATO"] }, ...(utente?.ufficio ? { ufficio: utente.ufficio } : {}) },
  });

  const preventivi = await prisma.preventivo.findMany({
    where: { ...brandFiltro, ...preventivoScope },
    take: 5,
    orderBy: { createdAt: "desc" },
    include: { cliente: true },
  });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
        <BrandSwitcher active={brand ?? "Tutti"} />
      </div>

      {comunicazioni.length > 0 && (
        <a href="/comunicazioni" className="block bg-white rounded-lg border border-neutral-200 border-l-4 border-l-orange-600 p-4 shadow-sm mb-4 hover:border-neutral-400">
          <span className="text-sm font-extrabold text-neutral-900">💬 Dal team: {comunicazioni.length} {comunicazioni.length === 1 ? "comunicazione da vedere" : "comunicazioni da vedere"}</span>
          {comunicazioni.map((r) => (
            <span key={r.id} className="block truncate text-xs text-neutral-700">
              {r.comunicazione.conTask ? `📌 ${r.comunicazione.titoloTask}` : `✉️ ${r.comunicazione.oggetto.replace(/\{[a-z_]+\}/g, "")}`} <span className="text-neutral-400">· {r.comunicazione.mittenteNome}</span>
            </span>
          ))}
        </a>
      )}

      {daEsitare.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 border-l-4 border-l-red-600 p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-neutral-900">📋 Appuntamenti da esitare: com&apos;è andata?</span>
            <span className="text-2xl font-extrabold text-red-700">{daEsitare.length}</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {daEsitare.slice(0, 8).map((a) => (
              <li key={a.id}><a href={`/calendario/appuntamento/${a.id}`} className="text-blue-800 underline">{a.dataOra.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {a.cliente}</a></li>
            ))}
          </ul>
          {regoleEs && regoleEs.giorniLista > regoleEs.giorniPromemoria && <p className="mt-2 text-xs text-neutral-500">Dopo {regoleEs.giorniLista} giorni senza esito passano al centralino.</p>}
        </div>
      )}

      {chiamateDaFare > 0 && (
        <a href="/lead" className="flex items-center justify-between bg-white rounded-lg border border-neutral-200 border-l-4 border-l-purple-600 p-4 shadow-sm mb-4 hover:border-neutral-400">
          <span className="text-sm font-extrabold text-neutral-900">📞 Chiamate con commerciale da fare ed esitare</span>
          <span className="text-2xl font-extrabold text-purple-700">{chiamateDaFare}</span>
        </a>
      )}

      {segnalazioni > 0 && (
        <a href="/segnalazioni" className="flex items-center justify-between bg-white rounded-lg border border-neutral-200 border-l-4 border-l-red-600 p-4 shadow-sm mb-4 hover:border-neutral-400">
          <span className="text-sm font-extrabold text-neutral-900">🆘 Segnalazioni del team da guardare</span>
          <span className="text-2xl font-extrabold text-red-700">{segnalazioni}</span>
        </a>
      )}

      {taskClienti > 0 && (
        <a href="/task#task-clienti" className="flex items-center justify-between bg-white rounded-lg border border-neutral-200 border-l-4 border-l-amber-500 p-4 shadow-sm mb-4 hover:border-neutral-400">
          <span className="text-sm font-extrabold text-neutral-900">📌 Task sui clienti da fare</span>
          <span className="text-2xl font-extrabold text-amber-600">{taskClienti}</span>
        </a>
      )}

      <a href="/task" className="flex items-center justify-between bg-white rounded-lg border border-neutral-200 border-l-4 border-l-green-600 p-4 shadow-sm mb-4 hover:border-neutral-400">
        <span className="text-sm font-extrabold text-neutral-900">✅ Task pratiche aperti{utente?.ufficio ? " per il tuo ufficio" : ""}</span>
        <span className="text-2xl font-extrabold text-green-700">{taskAperti}</span>
      </a>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-neutral-200 border-l-4 border-l-blue-500 p-4 shadow-sm">
          <p className="text-xs font-semibold text-neutral-600 mb-1">Preventivi aperti</p>
          <p className="text-2xl font-bold text-neutral-900">{preventiviAperti}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 border-l-4 border-l-emerald-500 p-4 shadow-sm">
          <p className="text-xs font-semibold text-neutral-600 mb-1">Valore in pipeline</p>
          <p className="text-2xl font-bold text-neutral-900">
            {(valorePipeline._sum.totaleNetto ?? 0).toLocaleString("it-IT", {
              style: "currency",
              currency: "EUR",
            })}
          </p>
        </div>
        <div className="bg-amber-50 rounded-lg border border-amber-200 border-l-4 border-l-amber-500 p-4 shadow-sm">
          <p className="text-xs font-semibold text-amber-800 mb-1">Lead da lavorare</p>
          <p className="text-2xl font-bold text-amber-700">{leadDaLavorare}</p>
        </div>
      </div>

      <h2 className="text-base font-bold text-neutral-900 mb-3">Preventivi recenti</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
        {preventivi.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium">{p.cliente.nome}</span>
            <span className="text-neutral-600">
              {p.totaleNetto.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
            </span>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                p.stato === "APERTO"
                  ? "bg-blue-50 text-blue-700"
                  : p.stato === "ACCETTATO"
                  ? "bg-green-50 text-green-700"
                  : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {p.stato}
            </span>
          </div>
        ))}
        {preventivi.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-600">Nessun preventivo ancora.</p>
        )}
      </div>
    </div>
  );
}
