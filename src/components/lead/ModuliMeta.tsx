import { prisma } from "@/lib/prisma";
import { loadMetaConfig } from "@/lib/meta/config";
import { spiegaErrore, type ModuloMeta } from "@/lib/meta/moduli";
import { arriviPerModulo, catalogo, cfgConModuli, indirizzoGateway, moduliCollegati, pagineCollegate, scartati } from "@/lib/meta/moduli-server";
import { aggiornaElencoMeta, attivaLeadPaginaMeta, collegaChiaveMeta, collegaModuloMeta, marchioPaginaMeta, recuperaLeadModuloMeta } from "@/app/meta-actions";
import type { ModuloGraph } from "@/lib/meta/graph";

const quando = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const sel = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";

/** Impostazioni › Lead › Moduli istantanei di Meta: elenco letto da Meta, collega/scollega con il marchio, recupero dei lead. */
export default async function ModuliMeta() {
  const fisse = loadMetaConfig();
  const [env, pagCrm, cat, collegati, arrivi, scart, gateway, brands, oggi] = await Promise.all([
    cfgConModuli(fisse), pagineCollegate(), catalogo(), moduliCollegati(), arriviPerModulo(), scartati(), indirizzoGateway(),
    prisma.brand.findMany({ select: { nome: true }, orderBy: { nome: "asc" } }),
    prisma.lead.count({ where: { metaFormId: { not: null }, createdAt: { gte: new Date(Date.now() - 86400_000) } } }),
  ]);
  const fissi = new Set(fisse.allowedFormIds);
  const paginaCrm = new Map(pagCrm.map((p) => [p.id, p]));
  const delCrm = new Map(collegati.map((m) => [m.formId, m]));
  const brandPagina = (pageId?: string | null) => (pageId ? env.pageBrands[pageId] : undefined) ?? env.defaultBrand;
  const pagine: { id: string; nome: string | null; moduli: ModuloGraph[]; errore?: string; iscritta?: boolean | null }[] = [
    ...(cat?.pagine ?? []),
    ...env.pageIds.filter((id) => !cat?.pagine.some((p) => p.id === id)).map((id) => ({ id, nome: paginaCrm.get(id)?.nome ?? null, moduli: [] as ModuloGraph[] })),
  ];
  const nelCatalogo = new Set(pagine.flatMap((p) => p.moduli.map((m) => m.id)));
  const altri = collegati.filter((m) => !nelCatalogo.has(m.formId));
  const scartatiFuori = Object.entries(scart).filter(([id]) => !nelCatalogo.has(id) && !delCrm.get(id)?.attivo && !fissi.has(id));

  const riga = (m: { id: string; nome: string; stato?: string | null; leadTotali?: number | null }, pageId: string | null) => {
    const c: ModuloMeta | undefined = delCrm.get(m.id);
    const fisso = fissi.has(m.id);
    const attivo = fisso || !!c?.attivo;
    const marchio = c?.brand ?? env.formBrands[m.id] ?? brandPagina(pageId);
    const a = arrivi.get(m.id);
    const s = scart[m.id];
    const archiviato = m.stato && m.stato !== "ACTIVE";
    return (
      <li key={m.id} className={`px-3 py-3 ${attivo ? "bg-green-50/50" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-neutral-900">
              {attivo ? <span className="mr-1 rounded-full bg-green-600 px-2 py-0.5 text-[11px] font-bold text-white">✓ Collegato</span> : <span className="mr-1 rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-bold text-neutral-700">Non collegato</span>}
              {m.nome}
              {archiviato && <span className="ml-1 text-xs font-normal text-neutral-500">(archiviato in Meta)</span>}
            </p>
            <p className="text-xs text-neutral-600">
              ID {m.id}{m.leadTotali != null ? ` · ${m.leadTotali} lead in Meta` : ""} · in P&C ONE: <b>{a?.n ?? 0}</b>{a ? ` (30 giorni: ${a.n30}, ultimo ${quando(a.ultimo)})` : ""}
              {attivo && <> · entrano come <b>{marchio}</b></>}
              {fisso && <> · fisso nelle impostazioni di Vercel</>}
            </p>
            {s && !attivo && <p className="text-xs font-semibold text-amber-800">⚠️ {s.n} lead arrivati da questo modulo e non entrati (ultimo {quando(s.ultimo)}): collegalo e poi «Recupera».</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!fisso && (
              <form action={collegaModuloMeta} className="flex flex-wrap items-center gap-1">
                <input type="hidden" name="formId" value={m.id} /><input type="hidden" name="nome" value={m.nome} /><input type="hidden" name="pageId" value={pageId ?? ""} />
                <select name="brand" defaultValue={marchio} className={sel} aria-label="Marchio dei lead">
                  {brands.map((b) => <option key={b.nome} value={b.nome}>{b.nome}</option>)}
                </select>
                <button className={`btn-3d ${attivo ? "btn-3d-outline" : "btn-3d-green"} px-3 py-1.5 text-xs`}>{attivo ? "Salva marchio" : "Collega"}</button>
              </form>
            )}
            {!fisso && attivo && (
              <form action={collegaModuloMeta}>
                <input type="hidden" name="formId" value={m.id} /><input type="hidden" name="attivo" value="0" /><input type="hidden" name="brand" value={c?.brand ?? ""} />
                <button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs text-red-700">Scollega</button>
              </form>
            )}
            {attivo && (
              <form action={recuperaLeadModuloMeta} className="flex items-center gap-1">
                <input type="hidden" name="formId" value={m.id} />
                <select name="giorni" defaultValue="7" className={sel} aria-label="Quanti giorni">
                  {[1, 3, 7, 14, 30, 90].map((g) => <option key={g} value={g}>ultimi {g} {g === 1 ? "giorno" : "giorni"}</option>)}
                </select>
                <button className="btn-3d btn-3d-teal px-3 py-1.5 text-xs">Recupera lead</button>
              </form>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <section id="meta" className="scroll-mt-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold text-neutral-900">📘 Moduli istantanei di Meta (Facebook e Instagram)</h2>
          <p className="text-xs text-neutral-600">
            Collega un modulo e i suoi lead arrivano da soli in P&C ONE, entro un minuto, alla telefonista del marchio scelto.
          </p>
          <p className="mt-1 text-xs">
            {gateway ? <span className="font-semibold text-green-800">● Collegamento con Meta attivo</span> : <span className="font-semibold text-amber-800">● In attesa del gateway (si presenta da solo entro 5 minuti)</span>}
            <span className="text-neutral-600"> · elenco letto da Meta: {cat ? quando(cat.lettoIl) : "non ancora"} · lead da Meta nelle ultime 24 ore: <b>{oggi}</b></span>
          </p>
        </div>
        <form action={aggiornaElencoMeta}><button className="btn-3d btn-3d-blue px-3 py-1.5 text-sm">🔄 Aggiorna l&apos;elenco da Meta</button></form>
      </div>

      <div className="mt-4 space-y-4">
        {pagine.map((p) => {
          const attivi = p.moduli.filter((m) => !m.stato || m.stato === "ACTIVE" || fissi.has(m.id) || delCrm.get(m.id)?.attivo);
          const archiviati = p.moduli.filter((m) => !attivi.includes(m));
          return (
            <div key={p.id} className="overflow-hidden rounded-lg border border-neutral-200">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 px-3 py-2">
                <p className="text-sm font-bold text-neutral-900">Pagina {p.nome ?? paginaCrm.get(p.id)?.nome ?? p.id}
                  <span className="font-normal text-neutral-500"> · marchio di base {brandPagina(p.id)}</span>
                  {p.iscritta === true && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-800">📡 riceve i lead</span>}
                  {paginaCrm.get(p.id)?.token && <span className="ml-2 text-[11px] font-normal text-neutral-500">🔑 chiave salvata il {quando(paginaCrm.get(p.id)?.il)}</span>}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {paginaCrm.has(p.id) && (
                    <form action={marchioPaginaMeta} className="flex items-center gap-1">
                      <input type="hidden" name="pageId" value={p.id} />
                      <select name="brand" defaultValue={brandPagina(p.id)} className={sel} aria-label="Marchio di base della pagina">{brands.map((b) => <option key={b.nome} value={b.nome}>{b.nome}</option>)}</select>
                      <button className="btn-3d btn-3d-outline px-2 py-1 text-xs">Salva</button>
                    </form>
                  )}
                  {p.iscritta === false && (
                    <form action={attivaLeadPaginaMeta}><input type="hidden" name="pageId" value={p.id} /><button className="btn-3d btn-3d-purple px-3 py-1.5 text-xs">📡 Attiva l&apos;arrivo dei lead</button></form>
                  )}
                </div>
              </div>
              {p.errore && <p className="px-3 py-2 text-xs font-semibold text-red-700">Moduli non letti: {spiegaErrore(p.errore)}</p>}
              <ul className="divide-y divide-neutral-100">{attivi.map((m) => riga(m, p.id))}</ul>
              {!p.moduli.length && !p.errore && <p className="px-3 py-2 text-xs text-neutral-500">{cat?.pagine.some((x) => x.id === p.id) ? "Nessun modulo in questa pagina." : "Elenco non ancora letto: premi «Aggiorna l'elenco da Meta»."}</p>}
              {archiviati.length > 0 && (
                <details className="border-t border-neutral-100">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-neutral-600">Moduli archiviati in Meta · {archiviati.length}</summary>
                  <ul className="divide-y divide-neutral-100">{archiviati.map((m) => riga(m, p.id))}</ul>
                </details>
              )}
            </div>
          );
        })}

        {(altri.length > 0 || scartatiFuori.length > 0 || [...fissi].some((id) => !nelCatalogo.has(id))) && (
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <p className="bg-neutral-50 px-3 py-2 text-sm font-bold text-neutral-900">Altri moduli</p>
            <ul className="divide-y divide-neutral-100">
              {[...fissi].filter((id) => !nelCatalogo.has(id) && !delCrm.has(id)).map((id) => riga({ id, nome: `Modulo ${id}` }, null))}
              {altri.map((m) => riga({ id: m.formId, nome: m.nome }, m.pageId ?? null))}
              {scartatiFuori.map(([id, s]) => riga({ id, nome: `Modulo ${id} (non nell'elenco)` }, s.pageId))}
            </ul>
          </div>
        )}

        <details id="chiave" className="rounded-lg border border-purple-200 bg-purple-50/40 px-3 py-2" open={pagine.some((p) => p.errore && /_c(100|190)$/.test(p.errore))}>
          <summary className="cursor-pointer select-none text-sm font-semibold text-purple-900">🔑 Chiave di Meta: aggiungi una pagina (es. Solaris) o rinnova l&apos;accesso</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-800">
            <li>Apri <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer" className="text-blue-800 underline">Graph API Explorer di Meta</a> con il Facebook che amministra le pagine (serve essere amministratore o sviluppatore dell&apos;app).</li>
            <li>A destra, in <b>«App Meta»</b>, scegli <b>CRM Interno P&C</b>. In <b>«Utente o pagina»</b> scegli <b>«Token d&apos;accesso utente»</b>.</li>
            <li>In <b>«Autorizzazioni»</b> aggiungi: <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_metadata</code>, <code>pages_manage_ads</code>, <code>leads_retrieval</code>, <code>business_management</code>.</li>
            <li>Premi <b>«Generate Access Token»</b>: nella finestra di Facebook spunta <b>tutte le pagine</b> (Gruppo P&C, Solaris…) e conferma.</li>
            <li>Copia il testo lungo del campo <b>«Token d&apos;accesso»</b>, incollalo qui sotto e premi «Salva la chiave». P&C ONE la trasforma in chiavi che non scadono, una per pagina, e le conserva cifrate.</li>
            <li>Poi premi <b>«Aggiorna l&apos;elenco da Meta»</b>: compare la pagina nuova. Se serve, premi <b>«📡 Attiva l&apos;arrivo dei lead»</b> e collega i suoi moduli.</li>
          </ol>
          <form action={collegaChiaveMeta} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-semibold">Chiave copiata da Meta
              <textarea name="chiave" required rows={2} autoComplete="off" spellCheck={false} placeholder="EAAB…" className={`block w-full font-mono ${sel}`} />
            </label>
            <button className="btn-3d btn-3d-purple px-3 py-2 text-sm">Salva la chiave</button>
          </form>
        </details>

        <details className="rounded-lg border border-neutral-200 px-3 py-2">
          <summary className="cursor-pointer select-none text-sm font-semibold text-neutral-800">➕ Collega un modulo con il suo ID</summary>
          <form action={collegaModuloMeta} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold">ID del modulo<input name="formId" required pattern="\d{5,25}" inputMode="numeric" placeholder="es. 1280816026986939" className={`block ${sel}`} /></label>
            <label className="text-xs font-semibold">Nome<input name="nome" placeholder="es. Pergole primavera" className={`block ${sel}`} /></label>
            <label className="text-xs font-semibold">Marchio
              <select name="brand" defaultValue={env.defaultBrand} className={`block ${sel}`}>{brands.map((b) => <option key={b.nome} value={b.nome}>{b.nome}</option>)}</select>
            </label>
            <button className="btn-3d btn-3d-green px-3 py-1.5 text-xs">Collega</button>
          </form>
        </details>

        <details className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2">
          <summary className="cursor-pointer select-none text-sm font-semibold text-blue-900">📖 Come si collega un nuovo modulo (guida per il marketing)</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-800">
            <li>In Meta (Business Suite › Moduli istantanei, o mentre crei l&apos;inserzione) crea il modulo sulla pagina <b>Gruppo P&C</b> o <b>Solaris</b>. Metti sempre le domande <b>nome e cognome</b>, <b>telefono</b> ed <b>email</b>: le altre domande arrivano nel lead come «Risposte del modulo».</li>
            <li>Qui premi <b>«Aggiorna l&apos;elenco da Meta»</b> (oppure aspetta 5 minuti): il modulo nuovo compare nella sua pagina.</li>
            <li>Scegli il <b>marchio</b> e premi <b>«Collega»</b>. Da quel momento ogni lead arriva entro un minuto nei «Task di oggi» della telefonista del marchio (Impostazioni › Lead, sotto).</li>
            <li>Se il modulo ha già raccolto lead prima del collegamento, premi <b>«Recupera lead»</b> scegliendo i giorni: entrano solo quelli che mancano, senza doppioni.</li>
            <li>Prova: con lo <a href="https://developers.facebook.com/tools/lead-ads-testing" target="_blank" rel="noreferrer" className="text-blue-800 underline">strumento di test dei lead di Meta</a> invia un lead di prova al modulo: dopo un minuto lo trovi in «Lead da lavorare».</li>
            <li>Se compare «L&apos;app non ha il permesso su questa pagina»: in Meta Business › Impostazioni › Integrazioni › <b>Accesso ai lead</b> dai l&apos;accesso all&apos;app del CRM.</li>
            <li>Una pagina Facebook nuova (es. Solaris): si aggiunge una volta sola con la «Chiave di Meta» qui sopra (serve chi amministra l&apos;app su Meta).</li>
          </ol>
        </details>
      </div>
    </section>
  );
}
