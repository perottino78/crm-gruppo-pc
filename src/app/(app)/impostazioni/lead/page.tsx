export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { BRAND_SLUGS, getLeadKey } from "@/lib/leadIngest";
import { configPresence } from "@/lib/meta/config";
import { prisma } from "@/lib/prisma";
import { rigeneraChiaveLead } from "@/app/lead-actions";

export default async function LeadSettings() {
  const u = await getCurrentUser();
  if (!isAmministratore(u)) redirect("/impostazioni");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "crm-gruppo-pc.vercel.app";
  const base = `https://${host}`;
  const chiave = await getLeadKey();
  const presenza = configPresence();
  const [conteggi, recenti] = await Promise.all([
    prisma.metaDelivery.groupBy({ by: ["stato"], _count: true }),
    prisma.metaDelivery.findMany({ orderBy: { receivedAt: "desc" }, take: 10, select: { leadgenId: true, stato: true, tentativi: true, erroreCodice: true, receivedAt: true } }),
  ]);
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
        <h2 className="font-bold text-neutral-900 mb-1">3 · Meta Lead Ads diretto: receiver (NON ancora collegato a Meta)</h2>
        <p className="text-xs text-neutral-600 mb-3">
          Il receiver è pronto ma non è registrato nella dashboard Meta: per la stessa app esiste già un callback principale.
          Prima del collegamento va scelto l&apos;assetto (gateway, inoltro transitorio o cutover): vedi <code>docs/META_LEADS.md</code>.
          Le credenziali si impostano solo come variabili d&apos;ambiente su Vercel, mai da qui.
        </p>
        <div className="text-sm mb-3">Indirizzo receiver: <span className={box}>{base}/api/lead/meta</span></div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs mb-3">
          {presenza.map((v) => (
            <div key={v.name} className="flex justify-between border-b border-neutral-100 py-0.5">
              <span className="font-mono">{v.name}{v.required ? " *" : ""}</span>
              <span className={v.set ? "text-green-700 font-bold" : v.required ? "text-red-700 font-bold" : "text-neutral-400"}>{v.set ? "impostata" : "mancante"}</span>
            </div>
          ))}
        </div>
        <div className="text-xs text-neutral-700 mb-1 font-semibold">
          Eventi ricevuti: {conteggi.length === 0 ? "nessuno" : conteggi.map((c) => `${c.stato} ${c._count}`).join(" · ")}
        </div>
        {recenti.length > 0 && (
          <table className="w-full text-xs">
            <tbody>
              {recenti.map((r) => (
                <tr key={r.leadgenId} className="border-t border-neutral-100">
                  <td className="py-1 font-mono">{r.leadgenId}</td>
                  <td>{r.stato}</td>
                  <td>tentativi {r.tentativi}</td>
                  <td className="text-red-700">{r.erroreCodice ?? ""}</td>
                  <td className="text-neutral-500">{r.receivedAt.toLocaleString("it-IT")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
