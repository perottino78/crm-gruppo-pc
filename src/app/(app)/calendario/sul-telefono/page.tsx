export const dynamic = "force-dynamic";

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { APP_URL, mailConfigurata } from "@/lib/mail/invio";
import { generaLinkCalendario, inviaLinkCalendarioATutti } from "@/app/calendario-actions";
import { prisma } from "@/lib/prisma";
import { vedeTutti } from "@/lib/calendario/eventi";
import { nomeUfficio } from "@/lib/flusso";

const google = (https: string) => `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(https.replace(/^https:/, "webcal:"))}`;
const iphone = (https: string) => https.replace(/^https:/, "webcal:");

export default async function SulTelefonoPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const u = await getCurrentUser();
  if (!u) return null;
  const { msg } = await searchParams;
  const https = u.calendarioToken ? `${APP_URL}/api/calendario/${u.calendarioToken}` : null;
  const webcal = https?.replace(/^https:/, "webcal:");
  const tutti = vedeTutti(u.ruolo);
  const admin = u.ruolo === "AMMINISTRATORE";
  const colleghi = tutti ? await prisma.utente.findMany({ where: { stato: "ATTIVO", id: { not: u.id } }, select: { id: true, nome: true, ufficio: true, email: true, calendarioToken: true }, orderBy: { nome: "asc" } }) : [];
  const passo = "rounded-xl border border-neutral-200 bg-white p-4";
  return (
    <div className="max-w-3xl">
      <Link href="/calendario" className="text-xs text-neutral-600 hover:underline">← Calendario</Link>
      <h1 className="text-2xl font-black text-neutral-900 mt-2">📱 Il calendario del CRM sul tuo telefono</h1>
      {msg && <p className="mt-3 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-900">{msg}</p>}
      <p className="text-sm text-neutral-700 mt-1 mb-5">
        Due modi, che funzionano insieme: gli <b>inviti via email</b> (arrivano subito, con il promemoria) e il <b>tuo calendario personale</b> (si aggiorna da solo con tutti i tuoi appuntamenti, rilievi e pose).
      </p>

      <div className={`${passo} mb-4`}>
        <h2 className="font-bold text-neutral-900 mb-1">1 · Inviti via email</h2>
        <p className="text-sm text-neutral-700">
          Ogni volta che ti viene fissato un appuntamento, un rilievo o una posa ricevi un&apos;email su <b>{u.email}</b> con l&apos;invito: tocca «Aggiungi al calendario» e l&apos;impegno entra nel telefono con il promemoria un&apos;ora prima. Se viene spostato o annullato arriva l&apos;aggiornamento.
        </p>
        {!(await mailConfigurata()) && <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">Gli inviti partiranno appena l&apos;amministratore attiva l&apos;invio email.</p>}
      </div>

      <div className={passo}>
        <h2 className="font-bold text-neutral-900 mb-1">2 · Il tuo calendario personale</h2>
        {!https ? (
          <form action={generaLinkCalendario}>
            <p className="text-sm text-neutral-700 mb-3">Crea il tuo link privato: lo aggiungi una sola volta al telefono e vedi sempre tutti i tuoi impegni del CRM.</p>
            <button className="btn-3d btn-3d-green px-5 py-2 text-sm">🔗 Crea il mio link calendario</button>
          </form>
        ) : (
          <>
            <p className="text-sm text-neutral-700">Il tuo link privato (non condividerlo: chi lo ha vede i tuoi appuntamenti):</p>
            <p className="my-2 rounded bg-neutral-100 px-3 py-2 font-mono text-xs break-all select-all">{https}</p>
            <div className="grid gap-2 sm:flex sm:flex-wrap mb-4">
              <a href={webcal!} className="btn-3d btn-3d-dark px-4 py-2 text-sm">🍎 Aggiungi a iPhone / Mac</a>
              <a href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal!)}`} target="_blank" className="btn-3d btn-3d-blue px-4 py-2 text-sm">📆 Aggiungi a Google Calendar</a>
              <a href={`https://outlook.office.com/calendar/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent("CRM P&C")}`} target="_blank" className="btn-3d btn-3d-teal px-4 py-2 text-sm">📧 Aggiungi a Outlook</a>
            </div>
            <ul className="text-sm text-neutral-700 list-disc pl-5 space-y-1">
              <li><b>iPhone:</b> tocca il pulsante nero dal telefono e conferma «Abbonati». In alternativa: Impostazioni › Calendario › Account › Aggiungi account › Altro › Aggiungi calendario sottoscritto, e incolla il link.</li>
              <li><b>Android:</b> aprilo dal computer con «Aggiungi a Google Calendar» usando lo stesso account Google del telefono; poi sul telefono, in Google Calendar › Impostazioni, attiva la sincronizzazione del calendario «CRM P&amp;C».</li>
              <li>iPhone e Outlook si aggiornano ogni pochi minuti; Google Calendar ogni qualche ora (per le novità urgenti fa fede l&apos;invito via email).</li>
            </ul>
            <form action={generaLinkCalendario} className="mt-4">
              <button className="text-xs text-red-700 underline">Rigenera il link (il vecchio smette di funzionare)</button>
            </form>
          </>
        )}
      </div>

      {tutti && (
        <div className={`${passo} mt-4`}>
          <h2 className="font-bold text-neutral-900 mb-1">3 · I calendari dei colleghi su Google</h2>
          {!https ? <p className="text-sm text-neutral-700">Prima crea il tuo link qui sopra: i calendari dei colleghi passano dal tuo link personale.</p> : (
            <>
              <p className="text-sm text-neutral-700 mb-3">Aggiungi a Google Calendar tutto il team in un solo calendario, oppure ogni collega come calendario a parte (Google gli dà un colore diverso e puoi accenderli e spegnerli).</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <a href={google(`${https}?team=1`)} target="_blank" className="btn-3d btn-3d-blue px-4 py-2 text-sm">👥 Tutto il team su Google</a>
                <a href={iphone(`${https}?team=1`)} className="btn-3d btn-3d-dark px-4 py-2 text-sm">👥 Tutto il team su iPhone</a>
              </div>
              <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {colleghi.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span><b>{c.nome}</b>{c.ufficio ? <span className="text-xs text-neutral-500"> · {nomeUfficio(c.ufficio)}</span> : null}</span>
                    <span className="flex gap-1.5">
                      <a href={google(`${https}?persona=${c.id}`)} target="_blank" className="btn-3d btn-3d-blue px-2.5 py-1 text-xs">Google</a>
                      <a href={iphone(`${https}?persona=${c.id}`)} className="btn-3d btn-3d-dark px-2.5 py-1 text-xs">iPhone</a>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {admin && (
        <div className={`${passo} mt-4`}>
          <h2 className="font-bold text-neutral-900 mb-1">4 · Manda a ognuno il suo calendario</h2>
          <p className="text-sm text-neutral-700 mb-3">Il CRM crea il link personale a chi non ce l&apos;ha e manda a ogni collega attivo un&apos;email con i pulsanti per Google, iPhone e Outlook. Ognuno vede nel telefono solo i suoi impegni.</p>
          <form action={inviaLinkCalendarioATutti} className="mb-3">
            <button className="btn-3d btn-3d-green px-5 py-2 text-sm">✉️ Manda il link a tutto il team</button>
          </form>
          <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {colleghi.map((c) => (
              <form key={c.id} action={inviaLinkCalendarioATutti} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <input type="hidden" name="utenteId" value={c.id} />
                <span><b>{c.nome}</b> <span className="text-xs text-neutral-500">{c.email}</span></span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.calendarioToken ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-500"}`}>{c.calendarioToken ? "✓ link creato" : "senza link"}</span>
                  <button className="btn-3d btn-3d-outline px-2.5 py-1 text-xs">Manda</button>
                </span>
              </form>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
