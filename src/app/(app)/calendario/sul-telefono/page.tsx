export const dynamic = "force-dynamic";

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { APP_URL, mailConfigurata } from "@/lib/mail/invio";
import { generaLinkCalendario } from "@/app/calendario-actions";

export default async function SulTelefonoPage() {
  const u = await getCurrentUser();
  if (!u) return null;
  const https = u.calendarioToken ? `${APP_URL}/api/calendario/${u.calendarioToken}` : null;
  const webcal = https?.replace(/^https:/, "webcal:");
  const passo = "rounded-xl border border-neutral-200 bg-white p-4";
  return (
    <div className="max-w-3xl">
      <Link href="/calendario" className="text-xs text-neutral-600 hover:underline">← Calendario</Link>
      <h1 className="text-2xl font-black text-neutral-900 mt-2">📱 Il calendario del CRM sul tuo telefono</h1>
      <p className="text-sm text-neutral-700 mt-1 mb-5">
        Due modi, che funzionano insieme: gli <b>inviti via email</b> (arrivano subito, con il promemoria) e il <b>tuo calendario personale</b> (si aggiorna da solo con tutti i tuoi appuntamenti, rilievi e pose).
      </p>

      <div className={`${passo} mb-4`}>
        <h2 className="font-bold text-neutral-900 mb-1">1 · Inviti via email</h2>
        <p className="text-sm text-neutral-700">
          Ogni volta che ti viene fissato un appuntamento, un rilievo o una posa ricevi un&apos;email su <b>{u.email}</b> con l&apos;invito: tocca «Aggiungi al calendario» e l&apos;impegno entra nel telefono con il promemoria un&apos;ora prima. Se viene spostato o annullato arriva l&apos;aggiornamento.
        </p>
        {!mailConfigurata() && <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">Gli inviti partiranno appena l&apos;amministratore attiva l&apos;invio email.</p>}
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
            <div className="flex flex-wrap gap-2 mb-4">
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
    </div>
  );
}
