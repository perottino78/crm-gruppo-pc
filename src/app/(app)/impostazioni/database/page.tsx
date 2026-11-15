export const dynamic = "force-dynamic";

// Consumo del database (richiesta di Ugo 15/11/2026, dopo il blocco di Neon): quanto stiamo usando, quanto costa, avvisi prima dei limiti.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { configConsumi, misureInterne, ultimaLettura } from "@/lib/database/consumi-server";
import { PREZZI_LAUNCH, formatoBytes } from "@/lib/database/consumi";
import { aggiornaConsumi, salvaConsumi, scollegaNeon } from "@/app/database-actions";

const inp = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const quando = (s: string) => new Date(s).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const giorno = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long" });
const usd = (n: number) => `$ ${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const COLORE = { ok: "border-green-300 bg-green-50 text-green-900", attenzione: "border-amber-300 bg-amber-50 text-amber-900", superato: "border-red-300 bg-red-50 text-red-900" };

function Barra({ valore, massimo }: { valore: number; massimo: number }) {
  const pct = massimo > 0 ? Math.min(100, (valore / massimo) * 100) : 0;
  const c = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-teal-500";
  return <div className="mt-2 h-2 rounded-full bg-neutral-200"><div className={`h-2 rounded-full ${c}`} style={{ width: `${pct}%` }} /></div>;
}

export default async function ConsumoDatabasePage({ searchParams }: { searchParams: Promise<{ ok?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "database")) redirect("/impostazioni");
  const p = await searchParams;
  const [cfg, l, interne] = await Promise.all([configConsumi(), ultimaLettura(), misureInterne().catch(() => null)]);
  const s = l?.stima;
  const tile = "rounded-lg border border-neutral-200 bg-white p-3";

  return (
    <div className="max-w-5xl space-y-4">
      <Link href="/impostazioni" className="btn-indietro">← Impostazioni</Link>
      <div>
        <h1 className="text-2xl font-extrabold text-neutral-900">📊 Consumo del database</h1>
        <p className="text-sm text-neutral-600">Quanto sta usando P&amp;C ONE il database (Neon, piano {cfg.piano === "FREE" ? "gratuito" : "Launch"}), quanto costa questo mese e la previsione a fine mese. Se ci si avvicina al budget o a un limite arriva un&apos;email, così non si blocca più come il 15 novembre.</p>
      </div>
      {p.ok && <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">✅ {p.ok}</p>}
      {p.errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{p.errore}</p>}

      {s && l ? (
        <section className="card-fase space-y-3" style={{ "--fase": "#0d9488" } as React.CSSProperties}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2>Questo mese ({giorno(l.consumo.inizio)} → oggi, {s.giorniPassati} giorni su {s.giorniTotali})</h2>
            <form action={aggiornaConsumi}><button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">🔄 Aggiorna adesso</button></form>
          </div>
          <p className={`rounded-lg border px-3 py-2 text-sm font-semibold ${COLORE[l.avviso.livello]}`}>
            {l.avviso.livello === "ok" ? "✅ Tutto nella norma." : l.avviso.livello === "attenzione" ? "⚠️ Attenzione:" : "🚨 Oltre il limite:"} {l.avviso.motivi.join(" · ")}
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className={tile}><p className="text-xs font-semibold text-neutral-500">COSTO FIN QUI</p><p className="text-2xl font-black">{usd(s.costo.totale)}</p><p className="text-xs text-neutral-500">calcolo {usd(s.costo.calcolo)} · spazio {usd(s.costo.spazio)}{s.costo.trasferimento ? ` · traffico ${usd(s.costo.trasferimento)}` : ""}</p></div>
            <div className={tile}><p className="text-xs font-semibold text-neutral-500">PREVISIONE FINE MESE</p><p className="text-2xl font-black">{usd(s.proiezione.totale)}</p><p className="text-xs text-neutral-500">budget {usd(cfg.budget)}</p><Barra valore={s.proiezione.totale} massimo={cfg.budget} /></div>
            <div className={tile}><p className="text-xs font-semibold text-neutral-500">TRAFFICO</p><p className="text-2xl font-black">{s.trasferimentoGB} GB</p><p className="text-xs text-neutral-500">{PREZZI_LAUNCH.trasferimentoInclusoGB} GB compresi · a fine mese ~{s.proiezione.trasferimentoGB} GB</p><Barra valore={s.proiezione.trasferimentoGB} massimo={PREZZI_LAUNCH.trasferimentoInclusoGB} /></div>
            <div className={tile}><p className="text-xs font-semibold text-neutral-500">CALCOLO</p><p className="text-2xl font-black">{s.cuOre} ore</p><p className="text-xs text-neutral-500">a fine mese ~{s.proiezione.cuOre} ore · {usd(PREZZI_LAUNCH.cuOra)}/ora</p></div>
          </div>
          <p className="text-xs text-neutral-500">Spazio occupato {s.spazioGB} GB ({usd(PREZZI_LAUNCH.gbMese)} al GB al mese). Ultima lettura da Neon: {quando(l.il)} (si aggiorna da sola ogni ora). Prezzi in dollari, tasse escluse: la fattura arriva da Vercel.</p>
        </section>
      ) : (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {cfg.haChiave ? "Nessuna lettura ancora: premi «Aggiorna adesso»." : "Per vedere costi e previsione serve la chiave dell'API di Neon (qui sotto). Senza chiave restano le misure interne in fondo alla pagina."}
          {cfg.haChiave && <form action={aggiornaConsumi} className="mt-2"><button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">🔄 Aggiorna adesso</button></form>}
        </div>
      )}

      <section className="card-fase space-y-3" style={{ "--fase": "#475569" } as React.CSSProperties}>
        <h2>⚙️ Collegamento, budget e avvisi</h2>
        <form action={salvaConsumi} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-neutral-700">Chiave dell&apos;API di Neon {cfg.haChiave && <span className="text-green-700">✓ collegata</span>}
              <input name="apiKey" type="password" autoComplete="off" placeholder={cfg.haChiave ? "•••••••• (lascia vuoto per tenerla)" : "napi_…"} className={`${inp} mt-1 w-full`} />
            </label>
            <label className="text-xs font-semibold text-neutral-700">ID del progetto Neon
              <input name="progetto" defaultValue={cfg.progetto} className={`${inp} mt-1 w-full`} />
            </label>
            <label className="text-xs font-semibold text-neutral-700">Budget al mese (dollari): avviso all&apos;80% e oltre
              <input name="budget" type="number" min="1" step="1" defaultValue={cfg.budget} className={`${inp} mt-1 w-full`} />
            </label>
            <label className="text-xs font-semibold text-neutral-700">Piano
              <select name="piano" defaultValue={cfg.piano} className={`${inp} mt-1 w-full`}>
                <option value="LAUNCH">Launch (a consumo)</option>
                <option value="FREE">Gratuito (limiti che bloccano il database)</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-neutral-700 md:col-span-2">Chi riceve gli avvisi (vuoto = gli amministratori)
              <input name="destinatari" defaultValue={cfg.destinatari} placeholder="es. ugo@gruppopec.com, amministrazione@gruppopec.com" className={`${inp} mt-1 w-full`} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-3d btn-3d-green px-4 py-2 text-sm">💾 Salva</button>
          </div>
        </form>
        {cfg.haChiave && <form action={scollegaNeon}><button className="text-xs text-red-700 underline">Togli la chiave di Neon</button></form>}
        <details className="rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Come prendere la chiave dell&apos;API di Neon (2 minuti)</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-neutral-700">
            <li>Vercel › <b>Storage</b> › <b>neon-bistre-pocket</b> › <b>Open in Neon</b>.</li>
            <li>Nel pannello di Neon: in alto a sinistra il nome dell&apos;organizzazione › <b>Settings</b> › <b>API keys</b>.</li>
            <li><b>Create new API key</b>, dai un nome (es. «P&amp;C ONE consumi») e copia la chiave (inizia con <code>napi_</code>): si vede una volta sola.</li>
            <li>Incollala qui sopra e premi Salva: il CRM la prova subito e la conserva cifrata.</li>
          </ol>
          <p className="mt-2 text-xs text-neutral-600">L&apos;ID del progetto è il «Neon ID» che Vercel mostra sotto il nome del database (oggi {cfg.progetto}).</p>
        </details>
        <p className="text-xs text-neutral-600">🔔 Se il database non risponde proprio, il controllo ogni 5 minuti di cron-job.org riceve un errore: in cron-job.org, nel controllo di P&amp;C ONE, accendi <b>«Notify me when the cronjob fails»</b> e arriva un&apos;email subito.</p>
      </section>

      {interne && (
        <section className="card-fase space-y-3" style={{ "--fase": "#6366f1" } as React.CSSProperties}>
          <h2>🔍 Misure interne (senza Neon)</h2>
          <p className="text-sm">Spazio occupato dal database: <b>{formatoBytes(interne.spazioBytes)}</b>.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-neutral-500"><th className="py-1">Tabelle più lette (stima)</th><th>Righe</th><th>Peso</th><th>Peso medio riga</th><th>Letto (stima)</th></tr></thead>
              <tbody>
                {interne.piuLette.map((t) => (
                  <tr key={t.nome} className="border-t border-neutral-100"><td className="py-1 font-mono text-xs">{t.nome}</td><td>{t.righe.toLocaleString("it-IT")}</td><td>{formatoBytes(t.bytes)}</td><td>{formatoBytes(t.pesoRiga)}</td><td className="font-semibold">{formatoBytes(t.lettoStimato)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500">Righe lette × peso medio della riga, dall&apos;ultimo riavvio del database: serve a capire quali parti del CRM leggono di più.</p>
        </section>
      )}
    </div>
  );
}
