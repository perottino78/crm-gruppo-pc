export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { BRAND_SLUGS, getConfig, getLeadKey } from "@/lib/leadIngest";
import { rigeneraChiaveLead, salvaMetaLead } from "@/app/lead-actions";

export default async function LeadSettings() {
  const u = await getCurrentUser();
  if (!isAmministratore(u)) redirect("/impostazioni");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "crm-gruppo-pc.vercel.app";
  const base = `https://${host}`;
  const chiave = await getLeadKey();
  const [vt, pt, mb] = await Promise.all([getConfig("meta_verify_token"), getConfig("meta_page_token"), getConfig("meta_brand")]);
  const box = "bg-neutral-50 border border-neutral-200 rounded px-2 py-1 text-xs break-all select-all font-mono";

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <Link href="/impostazioni" className="text-xs text-blue-600 underline">← Impostazioni</Link>
        <h1 className="text-2xl font-bold text-neutral-900 mt-1">Lead da pubblicità online</h1>
        <p className="text-sm text-neutral-600">Tre modi per far arrivare automaticamente i nominativi nel CRM (sezione Clienti → Lead).</p>
      </div>

      <section className="bg-white rounded-lg border border-neutral-200 p-4">
        <h2 className="font-bold text-neutral-900 mb-1">1 · Pagine di atterraggio (per le inserzioni)</h2>
        <p className="text-xs text-neutral-600 mb-3">Usa questi link come destinazione delle inserzioni Facebook/Instagram/Google. Aggiungi <code>?utm_source=facebook&amp;utm_campaign=nome</code> per tracciare la campagna.</p>
        <div className="space-y-2">
          {BRAND_SLUGS.map((b) => (
            <div key={b.slug} className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold w-36">{b.nome}</span>
              <span className={box}>{`${base}/richiedi/${b.slug}?utm_source=facebook`}</span>
              <Link href={`/richiedi/${b.slug}`} target="_blank" className="text-xs text-blue-600 underline">apri</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-neutral-200 p-4">
        <h2 className="font-bold text-neutral-900 mb-1">2 · Collegamento con il vostro gestionale pubblicità (Zapier / Make / webhook)</h2>
        <p className="text-xs text-neutral-600 mb-3">Dal sistema pubblicità invia una richiesta POST a questo indirizzo con i campi <b>nome, telefono, email, brand, fonte, note</b> (JSON o form). Nome e almeno telefono o email sono obbligatori. I doppioni (stesso telefono/email in 30 giorni) vengono uniti.</p>
        <div className="space-y-1 text-sm">
          <div>Indirizzo: <span className={box}>{base}/api/lead</span></div>
          <div>Intestazione: <span className={box}>x-api-key: {chiave}</span></div>
          <div className="text-xs text-neutral-500">oppure in un solo link: <span className={box}>{`${base}/api/lead?key=${chiave}`}</span></div>
        </div>
        <form action={rigeneraChiaveLead} className="mt-3">
          <button className="text-xs text-red-700 underline">Rigenera chiave (la vecchia smette di funzionare)</button>
        </form>
      </section>

      <section className="bg-white rounded-lg border border-neutral-200 p-4">
        <h2 className="font-bold text-neutral-900 mb-1">3 · Meta Lead Ads diretto (moduli istantanei Facebook/Instagram)</h2>
        <p className="text-xs text-neutral-600 mb-3">In Meta for Developers → la vostra app → Webhooks → Pagina → campo <b>leadgen</b>: come URL di callback usa l&apos;indirizzo qui sotto e come token di verifica quello che imposti qui.</p>
        <div className="text-sm mb-3">URL di callback: <span className={box}>{base}/api/lead/meta</span></div>
        <form action={salvaMetaLead} className="grid sm:grid-cols-3 gap-2 text-sm">
          <label className="block"><span className="text-xs text-neutral-600">Token di verifica (lo scegli tu)</span>
            <input name="meta_verify_token" placeholder={vt ? "già impostato" : "es. gpc-meta-2026"} className="w-full border border-neutral-200 rounded px-2 py-1" /></label>
          <label className="block"><span className="text-xs text-neutral-600">Token di accesso pagina Meta</span>
            <input name="meta_page_token" placeholder={pt ? "già impostato" : "incolla il token"} className="w-full border border-neutral-200 rounded px-2 py-1" /></label>
          <label className="block"><span className="text-xs text-neutral-600">Brand dei lead (P&amp;C, Solaris, Purafonte…)</span>
            <input name="meta_brand" placeholder={mb ?? "P&C"} className="w-full border border-neutral-200 rounded px-2 py-1" /></label>
          <div className="sm:col-span-3"><button className="btn-3d btn-3d-blue text-sm px-4 py-2">Salva</button></div>
        </form>
      </section>
    </div>
  );
}
