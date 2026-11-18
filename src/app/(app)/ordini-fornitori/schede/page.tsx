export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoGestireOrdini } from "@/lib/ordini/server";
import { salvaModelloScheda, eliminaModelloScheda } from "@/app/schede-produzione-actions";
import { MODELLI_PRONTI, MODELLO_PREDEFINITO, SEGNAPOSTO_FISSI, campiDaCompilare, compilaScheda, nomeCampo } from "@/lib/ordini/scheda-produzione";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

export default async function SchedeProduzionePage({ searchParams }: { searchParams: Promise<{ base?: string; modifica?: string; nuovo?: string; salvato?: string; eliminato?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u || !puoGestireOrdini(u)) notFound();
  const q = await searchParams;
  const [modelli, fornitori] = await Promise.all([
    prisma.schedaProduzioneModello.findMany({ include: { fornitore: { select: { ragioneSociale: true } } }, orderBy: [{ attivo: "desc" }, { nome: "asc" }] }),
    prisma.soggetto.findMany({ where: { ruoli: { has: "FORNITORE" }, attivo: true }, select: { id: true, ragioneSociale: true }, orderBy: { ragioneSociale: "asc" } }),
  ]);
  const inModifica = q.modifica ? modelli.find((m) => m.id === q.modifica) ?? null : null;
  const base = MODELLI_PRONTI.find((b) => b.chiave === q.base);
  const form = inModifica ?? (q.nuovo ? { id: "", nome: base && base.chiave !== "standard" ? base.nome : "", fornitoreId: null as string | null, html: base?.html ?? MODELLO_PREDEFINITO, attivo: true } : null);
  const esempio = form ? compilaScheda(form.html, { ordine: "123/2026", data: "18/11/2026", fornitore: "Fornitore Esempio srl", cliente: "Mario Rossi", commessa: "C2026-001", indirizzo: "Via Roma 1, Torino", consegna: "30/11/2026", misure_rilievo: "Soggiorno – finestra 2 ante: L 1200 × H 1400" }, '<table class="righe"><tr><th>#</th><th>Descrizione</th><th>Q.tà</th></tr><tr><td>1</td><td>Finestra 2 ante bianca</td><td>2 pz</td></tr></table>') : "";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div>
        <Link href="/ordini-fornitori" className="btn-indietro">← Ordini fornitori</Link>
        <h1 className="text-2xl font-bold text-neutral-900">📄 Schede di produzione per i fornitori</h1>
        <p className="text-sm text-neutral-700">Modelli HTML da compilare con le misure definitive e mandare al fornitore insieme all&apos;ordine. Il CRM riempie da solo i dati dell&apos;ordine; tu scrivi solo le misure e le note di produzione.</p>
      </div>
      {q.salvato && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ Modello salvato.</p>}
      {q.eliminato && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">Modello eliminato.</p>}
      {q.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{q.errore}</p>}

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold">I modelli ({modelli.length})</h2>
          <Link href="/ordini-fornitori/schede?nuovo=1" className="btn-3d btn-3d-green text-sm px-3 py-1.5">➕ Nuovo modello</Link>
        </div>
        <p className="text-xs text-neutral-700 mb-2">Parti da un modello già pronto: {MODELLI_PRONTI.map((b, i) => <span key={b.chiave}>{i > 0 && " · "}<Link href={`/ordini-fornitori/schede?nuovo=1&base=${b.chiave}`} className="underline text-blue-800" title={b.descrizione}>{b.nome}</Link></span>)}</p>
        {modelli.length === 0 ? <p className="text-sm text-neutral-600">Nessun modello ancora. Premi «Nuovo modello»: parte da una scheda già pronta (dati dell&apos;ordine, tabella del materiale, misure definitive, note di produzione).</p> : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {modelli.map((m) => (
              <li key={m.id} className="py-2 flex flex-wrap items-center gap-3">
                <span className="font-semibold">{m.nome}</span>
                <span className="text-xs text-neutral-600">{m.fornitore ? `per ${m.fornitore.ragioneSociale}` : "per tutti i fornitori"}{!m.attivo ? " · spento" : ""}</span>
                <span className="text-xs text-neutral-500">campi: {campiDaCompilare(m.html).map(nomeCampo).join(", ") || "—"}</span>
                <Link href={`/ordini-fornitori/schede?modifica=${m.id}`} className="text-blue-800 underline text-xs">apri e modifica</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {form && (
        <section className="bg-white border border-blue-200 rounded-lg p-4">
          <h2 className="font-bold mb-2">{form.id ? "Modifica il modello" : "Nuovo modello"}</h2>
          <form action={salvaModelloScheda} className="space-y-3">
            <input type="hidden" name="id" value={form.id} />
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-xs font-semibold">Nome del modello<input name="nome" defaultValue={form.nome} required placeholder="es. Scheda produzione serramenti" className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold">Per quale fornitore (vuoto = tutti)
                <select name="fornitoreId" defaultValue={form.fornitoreId ?? ""} className={`${inp} w-full`}><option value="">Tutti i fornitori</option>{fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}</select>
              </label>
            </div>
            <label className="text-xs font-semibold block">Testo HTML della scheda
              <textarea name="html" defaultValue={form.html} rows={22} spellCheck={false} className={`${inp} w-full font-mono text-xs`} />
            </label>
            <div className="text-xs text-neutral-700 rounded bg-neutral-50 border border-neutral-200 p-2">
              <p className="font-bold mb-1">Segnaposto riempiti dal CRM:</p>
              <p>{Object.entries(SEGNAPOSTO_FISSI).map(([k, v]) => <span key={k} className="inline-block mr-3"><code className="bg-white border px-1 rounded">{`{{${k}}}`}</code> {v}</span>)}</p>
              <p className="mt-1">Qualsiasi altro <code className="bg-white border px-1 rounded">{"{{nome_campo}}"}</code> diventa una casella da compilare quando prepari la scheda dall&apos;ordine (es. <code>{"{{misure_definitive}}"}</code>). Per le caselle da spuntare usa <code>{"{{sc:nome|Sì|No}}"}</code> (una sola scelta) o <code>{"{{multi:nome|A|B|C}}"}</code> (più scelte): nella scheda compaiono ☒ ☐. Per le tabelle riga per riga usa <code>{"{{tab_gruppo_1_colonna}}"}</code>, <code>{"{{tab_gruppo_2_colonna}}"}</code>… (es. <code>{"{{tab_dimensioni_1_L}}"}</code>): ogni gruppo diventa una piccola tabella da compilare.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-3d btn-3d-green text-sm px-4 py-2">💾 Salva il modello</button>
              <Link href="/ordini-fornitori/schede" className="btn-3d btn-3d-outline text-sm px-4 py-2">Chiudi</Link>
            </div>
          </form>
          {form.id && <form action={eliminaModelloScheda} className="mt-2"><input type="hidden" name="id" value={form.id} /><button className="text-xs text-red-700 underline">elimina questo modello</button></form>}
          <h3 className="font-bold mt-4 mb-1 text-sm">Anteprima (con dati di esempio, come l&apos;ultima versione salvata)</h3>
          <iframe title="Anteprima" sandbox="" srcDoc={esempio} className="w-full h-[520px] border border-neutral-300 rounded bg-white" />
        </section>
      )}
    </div>
  );
}
