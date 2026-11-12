export const dynamic = "force-dynamic";

// Collegamento ai calendari Nextcloud: accesso, abbinamento dei calendari alle persone, stato della sincronizzazione.
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { configNextcloud } from "@/lib/calendario/nextcloud";
import { salvaAccesso, salvaAbbinamenti, sincronizzaOra, scollegaNextcloud } from "@/app/nextcloud-actions";
import BottoneConferma from "@/components/BottoneConferma";

const inp = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";

export default async function NextcloudPage({ searchParams }: { searchParams: Promise<{ ok?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "calendario.nextcloud")) redirect("/impostazioni");
  const p = await searchParams;
  const [cfg, utenti] = await Promise.all([configNextcloud(), prisma.utente.findMany({ where: { stato: "ATTIVO" }, select: { id: true, nome: true }, orderBy: { nome: "asc" } })]);
  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/impostazioni" className="btn-indietro">← Impostazioni</Link>
      <div>
        <h1 className="text-2xl font-extrabold text-neutral-900">🗓️ Calendari Nextcloud</h1>
        <p className="text-sm text-neutral-600">
          P&amp;C ONE scrive gli impegni di ogni persona nel suo calendario Nextcloud e ogni pochi minuti li rilegge: se un appuntamento viene spostato o
          cancellato su Nextcloud si aggiorna anche qui, e gli impegni scritti solo su Nextcloud (smart working, fiere…) compaiono nel calendario di P&amp;C ONE.
        </p>
      </div>
      {p.ok && <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">✅ {p.ok}</p>}
      {p.errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{p.errore}</p>}

      <section className="card-fase" style={{ "--fase": "#0082c9" } as React.CSSProperties}>
        <h2>1 · Accesso</h2>
        <p className="mb-2 text-xs text-neutral-600">Su Nextcloud: in alto a destra il tuo profilo › Impostazioni › Sicurezza › «Crea una nuova password per app» (nome: P&amp;C ONE). Incollala qui: viene salvata cifrata.</p>
        <form action={salvaAccesso} className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs font-semibold text-neutral-700">Indirizzo del server<input name="url" required defaultValue={cfg.url ?? "https://businesscloudonline.it"} className={`${inp} block w-full`} /></label>
          <label className="text-xs font-semibold text-neutral-700">Utente Nextcloud<input name="utente" required defaultValue={cfg.utente ?? ""} className={`${inp} block w-full`} /></label>
          <label className="text-xs font-semibold text-neutral-700">Password per app<input name="password" type="password" autoComplete="new-password" placeholder={cfg.haPassword ? "•••••• (salvata: lascia vuoto per tenerla)" : ""} required={!cfg.haPassword} className={`${inp} block w-full`} /></label>
          <div className="sm:col-span-3"><button className="btn-3d btn-3d-blue px-4 py-2 text-sm">🔌 Salva e prova il collegamento</button></div>
        </form>
      </section>

      {cfg.calendari.length > 0 && (
        <section className="card-fase" style={{ "--fase": "#16a34a" } as React.CSSProperties}>
          <h2>2 · Di chi è ogni calendario</h2>
          <p className="mb-2 text-xs text-neutral-600">
            Abbinati in automatico dal nome; correggi se serve. «Scrivi qui» = P&amp;C ONE mette in quel calendario gli impegni della persona (uno per persona).
            I calendari senza persona non vengono usati. Attenzione: se BConsole scrive ancora sugli stessi calendari, finché si usano entrambi gli appuntamenti fissati in BConsole compaiono anche qui come «Da Nextcloud».
          </p>
          <form action={salvaAbbinamenti}>
            <div className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
              {cfg.calendari.map((c, i) => (
                <div key={c.href} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_220px_130px]">
                  <span className="min-w-0 truncate text-sm font-semibold text-neutral-900" title={c.href}>{c.nome}</span>
                  <select name={`utente_${i}`} defaultValue={c.utenteId ?? ""} className={inp} aria-label={`Persona del calendario ${c.nome}`}>
                    <option value="">— non usato —</option>
                    {utenti.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-neutral-700"><input type="checkbox" name={`scrivi_${i}`} value="1" defaultChecked={c.scrivi} /> ✍️ Scrivi qui</label>
                </div>
              ))}
            </div>
            <button className="btn-3d btn-3d-green mt-2 px-4 py-2 text-sm">💾 Salva gli abbinamenti</button>
          </form>
        </section>
      )}

      {cfg.dav && (
        <section className="card-fase" style={{ "--fase": "#7c3aed" } as React.CSSProperties}>
          <h2>3 · Sincronizzazione</h2>
          <p className="text-sm text-neutral-700">
            {cfg.stato ? <>Ultima: <b>{new Date(cfg.stato.il).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}</b> · <span className={cfg.stato.ok ? "text-green-800" : "text-red-700"}>{cfg.stato.messaggio}</span></> : "Non ancora fatta."}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Parte da sola a ogni cambio di un impegno, ogni 5 minuti mentre il CRM è aperto e con il controllo periodico.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <form action={sincronizzaOra}><button className="btn-3d btn-3d-purple px-4 py-2 text-sm">🔄 Sincronizza adesso</button></form>
            <form action={scollegaNextcloud}><BottoneConferma messaggio="Scollegare Nextcloud? Su Nextcloud non si cancella nulla." className="btn-3d btn-3d-outline px-4 py-2 text-sm">Scollega</BottoneConferma></form>
          </div>
        </section>
      )}
    </div>
  );
}
