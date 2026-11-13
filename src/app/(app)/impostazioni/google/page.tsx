export const dynamic = "force-dynamic";

// Collegamento a Google Calendar (account amministrazione): credenziali, consenso, calendari «BCONSOLE» → persone, stato della sincronizzazione.
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { configGoogle, REDIRECT_GOOGLE } from "@/lib/calendario/google";
import { aggiornaCalendari, salvaAbbinamentiGoogle, salvaCredenziali, scollegaGoogleOra, sincronizzaGoogleOra } from "@/app/google-actions";
import BottoneConferma from "@/components/BottoneConferma";

const inp = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const quando = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });

export default async function GooglePage({ searchParams }: { searchParams: Promise<{ ok?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "calendario.google")) redirect("/impostazioni");
  const p = await searchParams;
  const [cfg, utenti] = await Promise.all([configGoogle(), prisma.utente.findMany({ where: { stato: "ATTIVO" }, select: { id: true, nome: true }, orderBy: { nome: "asc" } })]);
  const nome = new Map(utenti.map((x) => [x.id, x.nome]));
  const senzaCalendario = utenti.filter((x) => !cfg.calendari.some((c) => c.utenteId === x.id));
  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/impostazioni" className="btn-indietro">← Impostazioni</Link>
      <div>
        <h1 className="text-2xl font-extrabold text-neutral-900">📅 Google Calendar</h1>
        <p className="text-sm text-neutral-600">
          P&amp;C ONE legge i calendari «BCONSOLE» dell&apos;account Google dell&apos;amministrazione: tutto quello che c&apos;è scritto (anche un semplice
          «occupato» messo dal commerciale) compare nel calendario di P&amp;C ONE e quella persona risulta occupata. Gli appuntamenti e le riunioni
          <b> nuovi</b> fissati in P&amp;C ONE vengono scritti nel calendario Google della persona. Vince sempre P&amp;C ONE; gli impegni scritti da altri su Google
          non vengono mai toccati, e gli appuntamenti che ci sono già non si cancellano né si modificano.
        </p>
      </div>
      {p.ok && <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">✅ {p.ok}</p>}
      {p.errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{p.errore}</p>}

      <section className="card-fase" style={{ "--fase": "#4285f4" } as React.CSSProperties}>
        <h2>1 · App Google (una volta sola)</h2>
        <p className="mb-2 text-xs text-neutral-600">
          Dalla Google Cloud Console (console.cloud.google.com) › API e servizi › Credenziali › «ID client OAuth» di tipo «Applicazione web». Come «URI di reindirizzamento
          autorizzato» incolla questo indirizzo:
        </p>
        <p className="mb-2 select-all break-all rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 font-mono text-xs text-blue-900">{REDIRECT_GOOGLE()}</p>
        <form action={salvaCredenziali} className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-neutral-700">Client ID<input name="clientId" required defaultValue={cfg.clientId ?? ""} placeholder="…apps.googleusercontent.com" className={`${inp} block w-full`} /></label>
          <label className="text-xs font-semibold text-neutral-700">Client secret<input name="clientSecret" type="password" autoComplete="new-password" placeholder={cfg.haSecret ? "•••••• (salvato: lascia vuoto per tenerlo)" : ""} required={!cfg.haSecret} className={`${inp} block w-full`} /></label>
          <div className="sm:col-span-2"><button className="btn-3d btn-3d-blue px-4 py-2 text-sm">💾 Salva</button></div>
        </form>
      </section>

      {cfg.clientId && cfg.haSecret && (
        <section className="card-fase" style={{ "--fase": "#16a34a" } as React.CSSProperties}>
          <h2>2 · Collega l&apos;account</h2>
          {cfg.collegato
            ? <p className="text-sm text-neutral-800">✅ Collegato{cfg.email ? <> all&apos;account <b>{cfg.email}</b></> : null}{cfg.dal ? <> dal {quando(cfg.dal)}: da quel momento gli appuntamenti nuovi di P&amp;C ONE vanno su Google</> : null}.</p>
            : <p className="text-sm text-neutral-700">Premi il pulsante, entra con l&apos;account Google dell&apos;amministrazione e premi «Consenti». Se Google avvisa «app non verificata», è normale (l&apos;app è nostra): «Avanzate» › «Vai a P&amp;C ONE».</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <a href="/api/google/collega" className="btn-3d btn-3d-green px-4 py-2 text-sm">{cfg.collegato ? "🔁 Ricollega Google" : "🔗 Collega Google"}</a>
            {cfg.collegato && <form action={aggiornaCalendari}><button className="btn-3d btn-3d-outline px-4 py-2 text-sm">🔄 Rileggi i calendari</button></form>}
          </div>
        </section>
      )}

      {cfg.collegato && (
        <section className="card-fase" style={{ "--fase": "#0f766e" } as React.CSSProperties}>
          <h2>3 · Di chi è ogni calendario «BCONSOLE»</h2>
          <p className="mb-2 text-xs text-neutral-600">
            Abbinati in automatico dal nome (se una persona ne ha due vince quello «finale»); correggi se serve. «✍️ Scrivi qui» = P&amp;C ONE ci mette gli appuntamenti
            nuovi della persona (uno per persona). I calendari senza persona non vengono usati.
          </p>
          {cfg.calendari.length === 0 ? <p className="text-sm text-red-700">Nessun calendario con «BCONSOLE» nel nome in questo account.</p> : (
            <form action={salvaAbbinamentiGoogle}>
              <div className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
                {cfg.calendari.map((c, i) => (
                  <div key={c.id} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_220px_130px]">
                    <span className={`min-w-0 truncate text-sm font-semibold ${c.utenteId ? "text-neutral-900" : "text-neutral-400"}`} title={c.id}>{c.nome}</span>
                    <select name={`utente_${i}`} defaultValue={c.utenteId && nome.has(c.utenteId) ? c.utenteId : ""} className={inp} aria-label={`Persona del calendario ${c.nome}`}>
                      <option value="">— non usato —</option>
                      {utenti.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-neutral-700"><input type="checkbox" name={`scrivi_${i}`} value="1" defaultChecked={c.scrivi} /> ✍️ Scrivi qui</label>
                  </div>
                ))}
              </div>
              <button className="btn-3d btn-3d-green mt-2 px-4 py-2 text-sm">💾 Salva gli abbinamenti</button>
            </form>
          )}
          {senzaCalendario.length > 0 && cfg.calendari.length > 0 && (
            <p className="mt-2 text-xs text-neutral-500">Persone attive senza calendario Google: {senzaCalendario.map((x) => x.nome).join(", ")}.</p>
          )}
        </section>
      )}

      {cfg.collegato && (
        <section className="card-fase" style={{ "--fase": "#7c3aed" } as React.CSSProperties}>
          <h2>4 · Sincronizzazione</h2>
          <p className="text-sm text-neutral-700">
            {cfg.stato ? <>Ultima: <b>{quando(new Date(cfg.stato.il))}</b> · <span className={cfg.stato.ok ? "text-green-800" : "text-red-700"}>{cfg.stato.messaggio}</span></> : "Non ancora fatta."}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Parte da sola a ogni appuntamento fissato o spostato, mentre il CRM è aperto e con il controllo ogni 5 minuti. Legge da 7 giorni fa a 4 mesi avanti.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <form action={sincronizzaGoogleOra}><button className="btn-3d btn-3d-purple px-4 py-2 text-sm">🔄 Sincronizza adesso</button></form>
            <form action={scollegaGoogleOra}><BottoneConferma messaggio="Scollegare Google? Su Google Calendar non si cancella nulla." className="btn-3d btn-3d-outline px-4 py-2 text-sm">Scollega</BottoneConferma></form>
          </div>
        </section>
      )}
    </div>
  );
}
