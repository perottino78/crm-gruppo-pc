export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import {
  aggiornaCondizioniAcconto,
  registraIncassoAcconto,
  annullaIncassoAcconto,
  aggiornaFinanziamento,
  programmaRilievo,
  annullaRilievo,
  caricaRilievo,
  aggiungiNotaCommessa,
} from "@/app/commesse-actions";
import { STATI_COMMESSA, numeroCommessa, eur } from "@/lib/commesse";
import FotoRilievo from "@/components/FotoRilievo";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

export default async function CommessaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utente = await getCurrentUser();
  const c = await prisma.commessa.findUnique({
    where: { id },
    include: {
      cliente: true,
      brand: true,
      preventivo: true,
      responsabile: true,
      rilievi: { include: { tecnico: true, allegati: true }, orderBy: { dataOra: "desc" } },
      eventi: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) notFound();
  const tecnici = await prisma.utente.findMany({ orderBy: { nome: "asc" } });
  const admin = isAmministratore(utente);
  const gestoreIncassi = admin || utente?.ruolo === "AMMINISTRATIVO";
  const stato = STATI_COMMESSA[c.stato] ?? { label: c.stato, cls: "bg-neutral-200" };
  const finanz = c.accontoTipo === "FINANZIAMENTO";
  const viaLibera = finanz ? c.finanziamentoStato === "APPROVATO" : c.accontoIncassato;
  const defaultData = new Date(Date.now() + 86400000).toISOString().slice(0, 16);

  return (
    <div className="max-w-5xl">
      <Link href="/commesse" className="text-xs text-neutral-600 hover:underline">← Commesse</Link>
      <div className="flex items-center justify-between mt-2 mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">
          {numeroCommessa(c)} · {c.cliente.nome}
        </h1>
        <span className={`text-xs font-bold px-3 py-1 rounded ${stato.cls}`}>{stato.label}</span>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-3">
          <p className="text-xs text-neutral-600">Brand</p>
          <p className="text-sm font-medium">{c.brand.nome}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-3">
          <p className="text-xs text-neutral-600">Responsabile</p>
          <p className="text-sm font-medium">{c.responsabile?.nome ?? "—"}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-3">
          <p className="text-xs text-neutral-600">Totale vendita (IVA incl.)</p>
          <p className="text-sm font-bold">{eur(c.totaleVendita)}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-3">
          <p className="text-xs text-neutral-600">Preventivo</p>
          <Link href={`/preventivi/${c.preventivoId}`} className="text-sm font-medium text-blue-800 hover:underline">apri preventivo →</Link>
        </div>
      </div>

      {/* ACCONTO */}
      <section className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <h2 className="text-base font-bold text-neutral-900 mb-3">1 · Acconto / finanziamento</h2>
        <p className="text-sm text-neutral-800 mb-3">
          {finanz ? (
            <>Pagamento tramite <b>finanziamento</b>{c.finanziamentoSocieta ? ` (${c.finanziamentoSocieta})` : ""} — stato: <b>{(c.finanziamentoStato ?? "IN_ISTRUTTORIA").replace("_", " ").toLowerCase()}</b></>
          ) : (
            <>Acconto richiesto: <b>{c.accontoPercentuale}%</b> = <b>{eur(c.accontoImporto)}</b></>
          )}
          {viaLibera && <span className="ml-2 text-green-800 font-semibold">✔ via libera al rilievo</span>}
        </p>

        {!finanz && c.accontoIncassato && (
          <p className="text-sm text-green-900 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">
            Incassato {eur(c.accontoImportoIncassato ?? 0)} il {c.accontoIncassatoIl?.toLocaleDateString("it-IT")}
            {c.accontoModalita ? ` · ${c.accontoModalita}` : ""}{c.accontoNote ? ` · ${c.accontoNote}` : ""}
            {admin && (
              <form action={annullaIncassoAcconto} className="inline ml-3">
                <input type="hidden" name="id" value={c.id} />
                <button className="text-xs text-red-700 underline">annulla incasso</button>
              </form>
            )}
          </p>
        )}

        {!finanz && !c.accontoIncassato && gestoreIncassi && (
          <form action={registraIncassoAcconto} className="flex flex-wrap items-end gap-2 mb-3">
            <input type="hidden" name="id" value={c.id} />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Importo incassato €</label>
              <input name="importo" defaultValue={c.accontoImporto} className={`${inp} w-32`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Modalità</label>
              <select name="modalita" className={inp}>
                <option>Bonifico</option><option>Contanti</option><option>Assegno</option><option>Carta/POS</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Note / riferimento</label>
              <input name="note" className={`${inp} w-56`} />
            </div>
            <button className="btn-3d btn-3d-green text-xs px-3 py-1.5">Registra incasso acconto</button>
          </form>
        )}
        {!finanz && !c.accontoIncassato && !gestoreIncassi && (
          <p className="text-xs text-neutral-600 mb-3">L&apos;incasso dell&apos;acconto viene registrato dall&apos;amministrazione.</p>
        )}

        {finanz && gestoreIncassi && (
          <form action={aggiornaFinanziamento} className="flex flex-wrap items-end gap-2 mb-3">
            <input type="hidden" name="id" value={c.id} />
            <select name="finanziamentoStato" defaultValue={c.finanziamentoStato ?? "IN_ISTRUTTORIA"} className={inp}>
              <option value="IN_ISTRUTTORIA">In istruttoria</option>
              <option value="APPROVATO">Approvato</option>
              <option value="RIFIUTATO">Rifiutato</option>
            </select>
            <input name="finanziamentoNote" defaultValue={c.finanziamentoNote ?? ""} placeholder="Note pratica" className={`${inp} w-64`} />
            <button className="btn-3d btn-3d-blue text-xs px-3 py-1.5">Aggiorna stato</button>
          </form>
        )}

        {admin ? (
          <details className="border-t border-neutral-200 pt-3">
            <summary className="text-xs font-semibold text-neutral-800 cursor-pointer">Modifica condizioni (solo responsabile)</summary>
            <form action={aggiornaCondizioniAcconto} className="flex flex-wrap items-end gap-2 mt-2">
              <input type="hidden" name="id" value={c.id} />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-700">Modalità</label>
                <select name="accontoTipo" defaultValue={c.accontoTipo} className={inp}>
                  <option value="ACCONTO">Acconto</option>
                  <option value="FINANZIAMENTO">Finanziamento</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-700">% acconto</label>
                <input name="accontoPercentuale" defaultValue={c.accontoPercentuale} className={`${inp} w-20`} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-700">Importo € (opzionale)</label>
                <input name="accontoImporto" placeholder="auto" className={`${inp} w-28`} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-700">Società finanziaria</label>
                <input name="finanziamentoSocieta" defaultValue={c.finanziamentoSocieta ?? ""} className={`${inp} w-40`} />
              </div>
              <button className="btn-3d btn-3d-orange text-xs px-3 py-1.5">Salva condizioni</button>
            </form>
          </details>
        ) : (
          <p className="text-[11px] text-neutral-500 border-t border-neutral-200 pt-2">Le condizioni di acconto (50% o finanziamento) possono essere modificate solo dal responsabile.</p>
        )}
      </section>

      {/* RILIEVO */}
      <section className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <h2 className="text-base font-bold text-neutral-900 mb-3">2 · Rilievo misure</h2>
        {!viaLibera ? (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Il rilievo si sblocca dopo l&apos;incasso dell&apos;acconto{finanz ? " (finanziamento approvato)" : ""}.
          </p>
        ) : (
          <form action={programmaRilievo} className="flex flex-wrap items-end gap-2 mb-4">
            <input type="hidden" name="commessaId" value={c.id} />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Tecnico</label>
              <select name="tecnicoId" required className={inp}>
                <option value="">Seleziona…</option>
                {tecnici.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.ruolo === "POSATORE" ? " (posatore)" : ""}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Data e ora</label>
              <input type="datetime-local" name="dataOra" required defaultValue={defaultData} className={inp} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Indirizzo (se diverso)</label>
              <input name="indirizzo" placeholder="indirizzo cliente" className={`${inp} w-56`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Note per il tecnico</label>
              <input name="note" className={`${inp} w-56`} />
            </div>
            <button className="btn-3d btn-3d-blue text-xs px-3 py-1.5">Programma rilievo</button>
          </form>
        )}

        <div className="space-y-3">
          {c.rilievi.map((r) => (
            <div key={r.id} className="border border-neutral-200 rounded p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-900">
                  📅 {r.dataOra.toLocaleString("it-IT", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })} · {r.tecnico.nome}
                </p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${r.stato === "ESEGUITO" ? "bg-green-100 text-green-900" : r.stato === "ANNULLATO" ? "bg-red-100 text-red-900" : "bg-indigo-100 text-indigo-900"}`}>{r.stato}</span>
              </div>
              {r.indirizzo && <p className="text-xs text-neutral-700 mt-0.5">📍 {r.indirizzo}</p>}
              {r.note && <p className="text-xs text-neutral-700">Note: {r.note}</p>}

              {r.stato === "ESEGUITO" && (
                <div className="mt-2">
                  {r.misure && <pre className="text-xs whitespace-pre-wrap bg-neutral-50 border border-neutral-200 rounded p-2 text-neutral-900">{r.misure}</pre>}
                  {r.allegati.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {r.allegati.map((a) => (
                        <a key={a.id} href={a.dataUri} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.dataUri} alt={a.nome ?? "foto rilievo"} className="h-24 w-24 object-cover rounded border border-neutral-300" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {r.stato !== "ANNULLATO" && (
                <details className="mt-2">
                  <summary className="text-xs font-semibold text-blue-800 cursor-pointer">
                    {r.stato === "ESEGUITO" ? "Aggiungi misure / altre foto" : "Carica rilievo (misure e foto)"}
                  </summary>
                  <form action={caricaRilievo} className="mt-2 space-y-2">
                    <input type="hidden" name="rilievoId" value={r.id} />
                    <textarea name="misure" rows={6} defaultValue={r.misure ?? ""} placeholder={"Misure per ogni apertura/elemento, es.\nSoggiorno – finestra 2 ante: L 1200 × H 1400 …"} className={`${inp} w-full`} />
                    <FotoRilievo name="foto" />
                    <button className="btn-3d btn-3d-green text-xs px-3 py-1.5">Salva rilievo eseguito</button>
                  </form>
                </details>
              )}
              {r.stato === "PROGRAMMATO" && (
                <form action={annullaRilievo} className="mt-1">
                  <input type="hidden" name="rilievoId" value={r.id} />
                  <button className="text-xs text-red-700 underline">annulla rilievo</button>
                </form>
              )}
            </div>
          ))}
          {c.rilievi.length === 0 && <p className="text-xs text-neutral-600">Nessun rilievo programmato.</p>}
        </div>
      </section>

      {/* TIMELINE */}
      <section className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <h2 className="text-base font-bold text-neutral-900 mb-3">Storico</h2>
        <form action={aggiungiNotaCommessa} className="flex gap-2 mb-3">
          <input type="hidden" name="id" value={c.id} />
          <input name="testo" placeholder="Aggiungi una nota…" className={`${inp} flex-1`} />
          <button className="btn-3d btn-3d-dark text-xs px-3 py-1.5">Aggiungi</button>
        </form>
        <ul className="space-y-1.5">
          {c.eventi.map((e) => (
            <li key={e.id} className="text-sm text-neutral-900">
              <span className="text-xs text-neutral-500">{e.createdAt.toLocaleString("it-IT")}{e.utenteNome ? ` · ${e.utenteNome}` : ""} — </span>
              {e.testo}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
