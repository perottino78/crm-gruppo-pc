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
  generaFasiStandard,
  aggiungiFase,
  assegnaFase,
  chiudiFase,
  riapriFase,
  generaRigheOrdine,
  aggiornaRigaOrdine,
  aggiungiCostoManuale,
  eliminaCostoManuale,
  programmaPosa,
  annullaPosa,
  avviaPosa,
  caricaFotoPosa,
  completaPosa,
  registraSaldo,
  annullaSaldo,
  confermaGiornoPosa,
  chiudiCommessa,
  riapriCommessa,
  segnaRecensioneRichiesta,
  creaAssistenza,
} from "@/app/commesse-actions";
import { STATI_COMMESSA, numeroCommessa, eur } from "@/lib/commesse";
import FotoRilievo from "@/components/FotoRilievo";
import FirmaCliente from "@/components/FirmaCliente";

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
      fasi: { orderBy: { ordine: "asc" } },
      righeOrdine: { orderBy: { createdAt: "asc" } },
      costiManuali: { orderBy: { data: "asc" } },
      assistenze: { orderBy: { createdAt: "desc" } },
      pose: { include: { foto: { orderBy: { createdAt: "asc" } } }, orderBy: { dataInizio: "desc" } },
    },
  });
  if (!c) notFound();
  const [tecnici, fornitori, soggettiOperativi] = await Promise.all([
    prisma.utente.findMany({ orderBy: { nome: "asc" } }),
    prisma.soggetto.findMany({ where: { attivo: true, ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" } }),
    prisma.soggetto.findMany({ where: { attivo: true, OR: [{ ruoli: { has: "POSATORE_ESTERNO" } }, { ruoli: { has: "TECNICO_INTERNO" } }] }, orderBy: { ragioneSociale: "asc" } }),
  ]);
  const righePrev = await prisma.rigaPreventivo.findMany({ where: { preventivoId: c.preventivoId }, include: { optionali: true } });
  const venditaRiga = (rid?: string | null) => {
    const r = righePrev.find((x) => x.id === rid);
    return r ? (r.prezzoUnitario + r.optionalPrezzo) * r.quantita : null;
  };
  const costoOrarioUtente = (uid?: string | null) =>
    soggettiOperativi.find((x) => x.utenteId && x.utenteId === uid)?.costoOrario ?? "";

  // Scheda costi a scalare: movimenti in ordine cronologico con residuo progressivo
  const haAcquistiTotali = c.costiManuali.some((m) => m.categoria === "ACQUISTO_MATERIALE");
  const totaleAcquisti = c.costiManuali.filter((m) => m.categoria === "ACQUISTO_MATERIALE").reduce((t, m) => t + m.importo, 0);
  type Mov = { data: Date; voce: string; tipo: string; importo: number };
  const movimenti: Mov[] = [
    ...c.fasi.filter((f) => f.stato === "CHIUSA" && f.costoTotale > 0).map((f) => ({ data: f.chiusaIl ?? f.createdAt, voce: `Fase: ${f.nome}${f.assegnatoNome ? " (" + f.assegnatoNome + ")" : ""}`, tipo: "Manodopera", importo: f.costoTotale })),
    ...(haAcquistiTotali ? [] : c.righeOrdine).filter((r) => r.costoEffettivo !== null).map((r) => ({ data: r.arrivatoIl ?? r.ordinatoIl ?? r.createdAt, voce: `${r.descrizione}${r.fornitoreNome ? " — " + r.fornitoreNome : ""}`, tipo: "Materiale", importo: r.costoEffettivo ?? 0 })),
    ...c.costiManuali.map((m) => ({ data: m.data, voce: m.descrizione, tipo: m.categoria === "ALTRO" ? "Altro" : m.categoria === "ACQUISTO_MATERIALE" ? "Materiale (totale)" : m.categoria, importo: m.importo })),
  ].sort((a, b) => a.data.getTime() - b.data.getTime());
  const totaleCosti = movimenti.reduce((t, m) => t + m.importo, 0);
  const margine = c.totaleImponibile - totaleCosti;
  const marginePerc = c.totaleImponibile > 0 ? (margine / c.totaleImponibile) * 100 : 0;
  const righeSenzaCosto = haAcquistiTotali ? 0 : c.righeOrdine.filter((r) => r.costoEffettivo === null).length;
  const fasiAperte = c.fasi.filter((f) => f.stato !== "CHIUSA").length;
  let residuo = c.totaleImponibile;
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


      {/* FASI */}
      <section className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <h2 className="text-base font-bold text-neutral-900 mb-3">3 · Fasi della commessa</h2>
        {c.fasi.length === 0 ? (
          <form action={generaFasiStandard}>
            <input type="hidden" name="id" value={c.id} />
            <button className="btn-3d btn-3d-blue text-xs px-3 py-1.5">Genera fasi standard</button>
          </form>
        ) : (
          <div className="space-y-2">
            {c.fasi.map((f) => (
              <div key={f.id} className="border border-neutral-200 rounded p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-900">{f.ordine}. {f.nome}</p>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${f.stato === "CHIUSA" ? "bg-green-100 text-green-900" : f.stato === "IN_CORSO" ? "bg-indigo-100 text-indigo-900" : "bg-neutral-200 text-neutral-800"}`}>
                    {f.stato === "CHIUSA" ? "CHIUSA" : f.stato === "IN_CORSO" ? "IN CORSO" : "DA FARE"}
                  </span>
                </div>
                {f.stato === "CHIUSA" ? (
                  <p className="text-xs text-neutral-800 mt-1">
                    Chiusa da <b>{f.chiusaDaNome}</b> il {f.chiusaIl?.toLocaleDateString("it-IT")} · {f.forfait !== null ? `forfait ${eur(f.forfait)}` : `${f.ore ?? 0} h × ${eur(f.costoOrario ?? 0)}/h`} = <b>{eur(f.costoTotale)}</b>
                    {f.note ? ` · ${f.note}` : ""}
                    {admin && (
                      <form action={riapriFase} className="inline ml-3">
                        <input type="hidden" name="faseId" value={f.id} />
                        <button className="text-red-700 underline">riapri</button>
                      </form>
                    )}
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <form action={assegnaFase} className="flex items-center gap-2">
                      <input type="hidden" name="faseId" value={f.id} />
                      <select name="assegnatario" defaultValue={f.assegnatoUtenteId ? `U:${f.assegnatoUtenteId}` : f.assegnatoSoggettoId ? `S:${f.assegnatoSoggettoId}` : ""} className={inp}>
                        <option value="">Assegna a…</option>
                        <optgroup label="Utenti CRM">
                          {tecnici.map((t) => <option key={t.id} value={`U:${t.id}`}>{t.nome}</option>)}
                        </optgroup>
                        {soggettiOperativi.length > 0 && (
                          <optgroup label="Posatori / tecnici in anagrafica">
                            {soggettiOperativi.map((t) => <option key={t.id} value={`S:${t.id}`}>{t.ragioneSociale}</option>)}
                          </optgroup>
                        )}
                      </select>
                      <button className="btn-3d btn-3d-dark text-[11px] px-2 py-1">assegna</button>
                      {f.assegnatoNome && <span className="text-xs text-neutral-700">Assegnata a <b>{f.assegnatoNome}</b></span>}
                    </form>
                    <form action={chiudiFase} className="flex flex-wrap items-end gap-2 bg-neutral-50 border border-neutral-200 rounded p-2">
                      <input type="hidden" name="faseId" value={f.id} />
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-neutral-700">Ore lavorate</label>
                        <input name="ore" className={`${inp} w-20`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-neutral-700">Costo orario €</label>
                        <input name="costoOrario" defaultValue={costoOrarioUtente(utente?.id) as string | number} className={`${inp} w-24`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-neutral-700">oppure forfait €</label>
                        <input name="forfait" className={`${inp} w-24`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-neutral-700">Note</label>
                        <input name="note" className={`${inp} w-48`} />
                      </div>
                      <button className="btn-3d btn-3d-green text-xs px-3 py-1.5">Chiudi fase</button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <form action={aggiungiFase} className="flex gap-2 mt-3">
          <input type="hidden" name="commessaId" value={c.id} />
          <input name="nome" placeholder="Nuova fase (es. Sopralluogo muratore)" className={`${inp} flex-1`} />
          <button className="btn-3d btn-3d-dark text-xs px-3 py-1.5">Aggiungi fase</button>
        </form>
      </section>

      {/* RIGHE DA VIDIMARE */}
      <section className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <h2 className="text-base font-bold text-neutral-900 mb-1">4 · Righe da ordinare (vidimazione)</h2>
        <p className="text-xs text-neutral-600 mb-3">La spunta &quot;ordinato&quot; attesta che l&apos;ordine è stato eseguito con il modulo del prodotto. Quando la merce arriva spunta &quot;arrivato&quot; e inserisci il costo reale.</p>
        <div className="bg-amber-50 border border-amber-300 rounded p-3 mb-4">
          <p className="text-sm font-bold text-neutral-900 mb-1">Modo rapido: totale acquisto materiali{haAcquistiTotali ? ` — registrato ${eur(totaleAcquisti)}` : ""}</p>
          <p className="text-xs text-neutral-700 mb-2">Inserisci un solo importo per fornitore/fattura invece del costo di ogni riga. Se presente, sostituisce i costi per riga nella scheda costi.</p>
          <form action={aggiungiCostoManuale} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="commessaId" value={c.id} />
            <input type="hidden" name="categoria" value="ACQUISTO_MATERIALE" />
            <select name="fornitoreId" className={inp}>
              <option value="">Fornitore…</option>
              {fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
            </select>
            <input name="fatturaNumero" placeholder="N° fattura" className={`${inp} w-28`} />
            <input name="importo" placeholder="Totale acquisto €" required className={`${inp} w-36 border-amber-400`} />
            <button className="btn-3d btn-3d-orange text-xs px-3 py-1.5">Aggiungi acquisto</button>
          </form>
          {c.costiManuali.filter((m) => m.categoria === "ACQUISTO_MATERIALE").map((m) => (
            <p key={m.id} className="text-xs text-neutral-900 mt-1">• {m.descrizione}: <b>{eur(m.importo)}</b>
              {gestoreIncassi && (
                <form action={eliminaCostoManuale} className="inline ml-2"><input type="hidden" name="id" value={m.id} /><button className="text-red-700 underline">elimina</button></form>
              )}
            </p>
          ))}
        </div>
        {c.righeOrdine.length === 0 ? (
          <form action={generaRigheOrdine}>
            <input type="hidden" name="id" value={c.id} />
            <button className="btn-3d btn-3d-blue text-xs px-3 py-1.5">Genera elenco dalle righe del preventivo</button>
          </form>
        ) : (
          <div className="space-y-2">
            {c.righeOrdine.map((r) => (
              <form key={r.id} action={aggiornaRigaOrdine} className={`border rounded p-2 ${r.arrivato ? "border-green-300 bg-green-50" : r.ordinato ? "border-indigo-200 bg-indigo-50" : "border-neutral-200"}`}>
                <input type="hidden" name="rigaId" value={r.id} />
                <p className="text-sm font-medium text-neutral-900">{r.descrizione} <span className="text-xs text-neutral-600">× {r.quantita}</span></p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                  <select name="fornitoreId" defaultValue={r.fornitoreId ?? ""} className={inp}>
                    <option value="">Fornitore…</option>
                    {fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-neutral-900"><input type="checkbox" name="ordinato" defaultChecked={r.ordinato} /> Ordinato{r.ordinatoIl ? ` (${r.ordinatoIl.toLocaleDateString("it-IT")})` : ""}</label>
                  <label className="flex items-center gap-1 text-xs text-neutral-900"><input type="checkbox" name="arrivato" defaultChecked={r.arrivato} /> Arrivato{r.arrivatoIl ? ` (${r.arrivatoIl.toLocaleDateString("it-IT")})` : ""}</label>
                  {venditaRiga(r.rigaPreventivoId) !== null && (
                    <span className="text-xs text-neutral-700">Vendita <b>{eur(venditaRiga(r.rigaPreventivoId) ?? 0)}</b></span>
                  )}
                  <div className="flex flex-col">
                    <label className="text-[10px] text-neutral-600">Costo d&apos;acquisto €</label>
                    <input name="costoEffettivo" defaultValue={r.costoEffettivo ?? ""} placeholder="inserisci quando noto" className={`${inp} w-36 border-amber-400`} />
                  </div>
                  {r.costoEffettivo !== null && venditaRiga(r.rigaPreventivoId) !== null && (
                    <span className="text-xs text-green-900">margine riga <b>{eur((venditaRiga(r.rigaPreventivoId) ?? 0) - (r.costoEffettivo ?? 0))}</b></span>
                  )}
                  <input name="note" defaultValue={r.note ?? ""} placeholder="Note" className={`${inp} w-40`} />
                  <button className="btn-3d btn-3d-blue text-[11px] px-2 py-1">salva</button>
                </div>
              </form>
            ))}
            <form action={generaRigheOrdine}>
              <input type="hidden" name="id" value={c.id} />
              <button className="text-xs text-blue-800 underline">Aggiorna elenco con eventuali righe nuove del preventivo</button>
            </form>
          </div>
        )}
      </section>

      {/* SCHEDA COSTI A SCALARE */}
      <section className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <h2 className="text-base font-bold text-neutral-900 mb-3">5 · Scheda costi a scalare</h2>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="rounded border border-neutral-200 p-3"><p className="text-xs text-neutral-600">Vendita (imponibile)</p><p className="text-sm font-bold">{eur(c.totaleImponibile)}</p></div>
          <div className="rounded border border-neutral-200 p-3"><p className="text-xs text-neutral-600">Costi registrati</p><p className="text-sm font-bold">{eur(totaleCosti)}</p></div>
          <div className={`rounded border p-3 ${margine < 0 ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`}><p className="text-xs text-neutral-600">Margine residuo</p><p className="text-sm font-bold">{eur(margine)}</p></div>
          <div className="rounded border border-neutral-200 p-3"><p className="text-xs text-neutral-600">Margine %</p><p className="text-sm font-bold">{marginePerc.toFixed(1)}%</p></div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-600 border-b border-neutral-200">
              <th className="py-1">Data</th><th>Voce</th><th>Tipo</th><th className="text-right">Costo</th><th className="text-right">Residuo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-100 bg-neutral-50">
              <td className="py-1.5">{c.createdAt.toLocaleDateString("it-IT")}</td><td className="font-medium">Valore commessa (imponibile)</td><td></td><td></td><td className="text-right font-semibold">{eur(c.totaleImponibile)}</td>
            </tr>
            {movimenti.map((m, i) => {
              residuo -= m.importo;
              return (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="py-1.5">{m.data.toLocaleDateString("it-IT")}</td>
                  <td>{m.voce}</td>
                  <td className="text-xs text-neutral-600">{m.tipo}</td>
                  <td className="text-right text-red-800">− {eur(m.importo)}</td>
                  <td className={`text-right font-semibold ${residuo < 0 ? "text-red-700" : "text-neutral-900"}`}>{eur(residuo)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(righeSenzaCosto > 0 || fasiAperte > 0) && (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
            Costi ancora da consuntivare: {righeSenzaCosto} righe merce senza costo reale · {fasiAperte} fasi non chiuse. Il margine mostrato si aggiorna man mano.
          </p>
        )}
        <form action={aggiungiCostoManuale} className="flex flex-wrap items-end gap-2 mt-4 border-t border-neutral-200 pt-3">
          <input type="hidden" name="commessaId" value={c.id} />
          <input name="descrizione" placeholder="Altro costo (trasporto, noleggio…)" className={`${inp} w-64`} required />
          <select name="categoria" className={inp}><option value="ALTRO">Altro</option><option value="Trasporto">Trasporto</option><option value="Noleggio">Noleggio</option><option value="Materiale">Materiale</option></select>
          <input name="importo" placeholder="Importo €" className={`${inp} w-28`} required />
          <button className="btn-3d btn-3d-dark text-xs px-3 py-1.5">Aggiungi costo</button>
        </form>
        {c.costiManuali.length > 0 && gestoreIncassi && (
          <div className="mt-2 flex flex-wrap gap-2">
            {c.costiManuali.map((m) => (
              <form key={m.id} action={eliminaCostoManuale} className="text-[11px] text-neutral-700">
                <input type="hidden" name="id" value={m.id} />
                {m.descrizione} <button className="text-red-700 underline">elimina</button>
              </form>
            ))}
          </div>
        )}
      </section>

      {/* SALDO */}
      <section className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <h2 className="text-base font-bold text-neutral-900 mb-1">6 · Saldo e conferma posa</h2>
        <p className="text-xs text-neutral-600 mb-3">Il saldo (fattura) si incassa prima dell&apos;uscita del materiale; dopo il saldo parte la conferma del giorno di posa al cliente.</p>
        {c.saldoIncassato ? (
          <p className="text-sm text-green-900 bg-green-50 border border-green-200 rounded px-3 py-2">
            ✔ Saldo incassato {eur(c.saldoImporto ?? 0)} il {c.saldoIncassatoIl?.toLocaleDateString("it-IT")}
            {c.fatturaSaldoNumero ? ` · fattura n. ${c.fatturaSaldoNumero}` : ""}{c.saldoModalita ? ` · ${c.saldoModalita}` : ""}
            {admin && (
              <form action={annullaSaldo} className="inline ml-3"><input type="hidden" name="id" value={c.id} /><button className="text-xs text-red-700 underline">annulla saldo</button></form>
            )}
          </p>
        ) : gestoreIncassi ? (
          <form action={registraSaldo} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={c.id} />
            <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Importo saldo €</label><input name="importo" defaultValue={Math.max(0, Math.round((c.totaleVendita - (c.accontoIncassato ? (c.accontoImportoIncassato ?? c.accontoImporto) : 0)) * 100) / 100)} className={`${inp} w-32`} /></div>
            <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">N° fattura saldo</label><input name="fatturaNumero" className={`${inp} w-32`} /></div>
            <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Data fattura</label><input type="date" name="fatturaData" className={inp} /></div>
            <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Modalità</label><select name="modalita" className={inp}><option>Bonifico</option><option>Contanti</option><option>Assegno</option><option>Carta/POS</option><option>Finanziamento</option></select></div>
            <button className="btn-3d btn-3d-green text-xs px-3 py-1.5">Registra saldo incassato</button>
          </form>
        ) : (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">In attesa del saldo: lo registra l&apos;amministrazione.</p>
        )}
      </section>

      {/* POSA E FINE LAVORI */}
      <section className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <h2 className="text-base font-bold text-neutral-900 mb-3">7 · Posa e fine lavori</h2>
        <form action={programmaPosa} className="flex flex-wrap items-end gap-2 mb-4">
          <input type="hidden" name="commessaId" value={c.id} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-700">Squadra / posatore</label>
            <select name="assegnatario" className={inp}>
              <option value="">Seleziona…</option>
              <optgroup label="Interni (utenti CRM)">
                {tecnici.map((t) => <option key={t.id} value={`U:${t.id}`}>{t.nome}</option>)}
              </optgroup>
              {soggettiOperativi.length > 0 && (
                <optgroup label="Anagrafica (interni ed esterni)">
                  {soggettiOperativi.map((t) => <option key={t.id} value={`S:${t.id}`}>{t.ragioneSociale}{t.ruoli.includes("POSATORE_ESTERNO") ? " (esterno)" : ""}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Inizio posa</label><input type="datetime-local" name="dataInizio" required defaultValue={defaultData} className={inp} /></div>
          <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Giorni</label><input name="giorniPrevisti" defaultValue="1" className={`${inp} w-16`} /></div>
          <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Altri nella squadra</label><input name="squadra" className={`${inp} w-44`} /></div>
          <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Indirizzo (se diverso)</label><input name="indirizzo" className={`${inp} w-48`} /></div>
          <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Note per la squadra</label><input name="note" className={`${inp} w-48`} /></div>
          <button className="btn-3d btn-3d-blue text-xs px-3 py-1.5">Programma posa</button>
        </form>

        <div className="space-y-3">
          {c.pose.map((p) => (
            <div key={p.id} className="border border-neutral-200 rounded p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-900">
                  🛠️ dal {p.dataInizio.toLocaleDateString("it-IT")} · {p.giorniPrevisti} gg · {p.tipo === "ESTERNA" ? "esterna" : "interna"}{p.assegnatoNome ? ` · ${p.assegnatoNome}` : ""}
                </p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${p.stato === "COMPLETATA" ? "bg-green-100 text-green-900" : p.stato === "IN_CORSO" ? "bg-indigo-100 text-indigo-900" : p.stato === "ANNULLATA" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>{p.stato.replace("_", " ")}</span>
              </div>
              {p.squadra && <p className="text-xs text-neutral-700">Squadra: {p.squadra}</p>}
              {p.indirizzo && <p className="text-xs text-neutral-700">📍 {p.indirizzo}</p>}
              {p.note && <p className="text-xs text-neutral-700">Note: {p.note}</p>}

              {p.foto.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {p.foto.map((f) => (
                    <a key={f.id} href={f.dataUri} target="_blank" rel="noreferrer" className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.dataUri} alt={f.nome ?? "foto posa"} className="h-20 w-20 object-cover rounded border border-neutral-300" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center">{f.categoria.toLowerCase()}</span>
                    </a>
                  ))}
                </div>
              )}

              {p.stato === "COMPLETATA" && (
                <div className="mt-2 text-xs text-neutral-900 bg-green-50 border border-green-200 rounded p-2">
                  Completata il {p.completataIl?.toLocaleString("it-IT")}{p.noteFine ? ` · ${p.noteFine}` : ""}
                  {p.firmaCliente && (
                    <div className="mt-1">
                      Firmato da <b>{p.nomeFirmatario ?? "cliente"}</b>:
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.firmaCliente} alt="firma cliente" className="h-14 bg-white border border-neutral-300 rounded mt-1" />
                    </div>
                  )}
                </div>
              )}

              {(p.stato === "PROGRAMMATA" || p.stato === "IN_CORSO") && (
                <div className="mt-2 space-y-2">
                  {p.stato === "PROGRAMMATA" && !c.saldoIncassato && (
                    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">Saldo non ancora incassato: la conferma del giorno di posa e l&apos;uscita del materiale restano bloccate.</p>
                  )}
                  {p.stato === "PROGRAMMATA" && c.saldoIncassato && !p.confermata && (
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={confermaGiornoPosa} className="inline">
                        <input type="hidden" name="posaId" value={p.id} />
                        <button className="btn-3d btn-3d-orange text-xs px-3 py-1.5">Conferma giorno di posa</button>
                      </form>
                      {c.cliente.email && (
                        <a
                          className="text-xs text-blue-800 underline"
                          href={`mailto:${c.cliente.email}?subject=${encodeURIComponent("Conferma giorno di posa — commessa " + numeroCommessa(c))}&body=${encodeURIComponent(`Gentile ${c.cliente.nome},\n\nconfermiamo che la posa avrà inizio il ${p.dataInizio.toLocaleDateString("it-IT")} (durata prevista ${p.giorniPrevisti} giorni).\n\nCordiali saluti`)}`}
                        >
                          ✉ scrivi la conferma al cliente
                        </a>
                      )}
                    </div>
                  )}
                  {p.confermata && p.stato === "PROGRAMMATA" && (
                    <p className="text-xs text-green-900">✔ Giorno di posa confermato il {p.confermataIl?.toLocaleDateString("it-IT")}</p>
                  )}
                  {p.stato === "PROGRAMMATA" && c.saldoIncassato && (
                    <form action={avviaPosa} className="inline">
                      <input type="hidden" name="posaId" value={p.id} />
                      <button className="btn-3d btn-3d-teal text-xs px-3 py-1.5">Avvia posa</button>
                    </form>
                  )}
                  <details>
                    <summary className="text-xs font-semibold text-blue-800 cursor-pointer">Carica foto (prima / durante / problemi)</summary>
                    <form action={caricaFotoPosa} className="mt-2 space-y-2">
                      <input type="hidden" name="posaId" value={p.id} />
                      <select name="categoria" className={inp}><option value="PRIMA">Prima</option><option value="DURANTE">Durante</option><option value="PROBLEMA">Problema</option></select>
                      <FotoRilievo name="foto" />
                      <button className="btn-3d btn-3d-blue text-xs px-3 py-1.5">Salva foto</button>
                    </form>
                  </details>
                  <details>
                    <summary className="text-xs font-semibold text-green-800 cursor-pointer">Fine lavori: verbale, firma e costo</summary>
                    <form action={completaPosa} className="mt-2 space-y-2">
                      <input type="hidden" name="posaId" value={p.id} />
                      <textarea name="noteFine" rows={3} placeholder="Note di fine lavori, eventuali riserve…" className={`${inp} w-full`} />
                      <FotoRilievo name="foto" />
                      <input name="nomeFirmatario" placeholder="Nome di chi firma" className={`${inp} w-64`} />
                      <FirmaCliente name="firmaCliente" />
                      <div className="bg-neutral-50 border border-neutral-200 rounded p-2 space-y-2">
                        <p className="text-xs font-bold text-neutral-800">Costo posa</p>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-900">
                          <label className="flex items-center gap-1"><input type="radio" name="tipoCosto" value="INTERNA" defaultChecked={p.tipo !== "ESTERNA"} /> Posa interna (ore × costo orario)</label>
                          <label className="flex items-center gap-1"><input type="radio" name="tipoCosto" value="ESTERNA" defaultChecked={p.tipo === "ESTERNA"} /> Squadra esterna (fattura)</label>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex flex-col gap-1"><label className="text-[11px] text-neutral-700">Ore totali</label><input name="ore" className={`${inp} w-20`} /></div>
                          <div className="flex flex-col gap-1"><label className="text-[11px] text-neutral-700">Costo orario €</label><input name="costoOrario" defaultValue={costoOrarioUtente(p.assegnatoUtenteId) as string | number} className={`${inp} w-24`} /></div>
                          <div className="flex flex-col gap-1"><label className="text-[11px] text-neutral-700">oppure forfait interno €</label><input name="forfait" className={`${inp} w-28`} /></div>
                          <div className="flex flex-col gap-1"><label className="text-[11px] text-neutral-700">Fattura squadra n°</label><input name="fatturaNumero" className={`${inp} w-28`} /></div>
                          <div className="flex flex-col gap-1"><label className="text-[11px] text-neutral-700">Importo fattura €</label><input name="fatturaImporto" className={`${inp} w-28`} /></div>
                        </div>
                      </div>
                      <button className="btn-3d btn-3d-green text-xs px-3 py-1.5">Chiudi posa e fine lavori</button>
                    </form>
                  </details>
                  <form action={annullaPosa}><input type="hidden" name="posaId" value={p.id} /><button className="text-xs text-red-700 underline">annulla posa</button></form>
                </div>
              )}
            </div>
          ))}
          {c.pose.length === 0 && <p className="text-xs text-neutral-600">Nessuna posa programmata.</p>}
        </div>
      </section>

      {/* CHIUSURA */}
      {(c.stato === "LAVORI_ESEGUITI" || c.stato === "CHIUSA") && (
        <section className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
          <h2 className="text-base font-bold text-neutral-900 mb-3">8 · Chiusura commessa</h2>
          {c.stato === "CHIUSA" ? (
            <div className="text-sm text-neutral-900 space-y-1">
              <p className="text-green-900 bg-green-50 border border-green-200 rounded px-3 py-2">✔ Commessa chiusa il {c.chiusaIl?.toLocaleDateString("it-IT")} · garanzia {c.garanziaMesi} mesi{c.fatturaFinaleNote ? ` · ${c.fatturaFinaleNote}` : ""}</p>
              {admin && <form action={riapriCommessa}><input type="hidden" name="id" value={c.id} /><button className="text-xs text-red-700 underline">riapri commessa</button></form>}
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="text-xs text-neutral-900 space-y-1">
                <li>{c.saldoIncassato ? "✔" : "✖"} Saldo incassato</li>
                <li>{fasiAperte === 0 ? "✔" : "✖"} Fasi chiuse{fasiAperte ? ` (${fasiAperte} aperte)` : ""}</li>
                <li>{righeSenzaCosto === 0 ? "✔" : "✖"} Costi di acquisto inseriti{righeSenzaCosto ? ` (mancano ${righeSenzaCosto} righe)` : ""}</li>
              </ul>
              <p className="text-xs text-neutral-700">Margine finale: <b>{eur(margine)}</b> ({marginePerc.toFixed(1)}%)</p>
              {gestoreIncassi ? (
                <form action={chiudiCommessa} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="fatturaFinaleNote" placeholder="Note fatturazione finale" className={`${inp} w-64`} />
                  <div className="flex flex-col gap-1"><label className="text-[11px] text-neutral-700">Garanzia (mesi)</label><input name="garanziaMesi" defaultValue={24} className={`${inp} w-20`} /></div>
                  <button className="btn-3d btn-3d-green text-xs px-3 py-1.5">Chiudi commessa</button>
                </form>
              ) : <p className="text-xs text-amber-900">La chiusura la fa l&apos;amministrazione.</p>}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {c.cliente.email && (
                  <a className="text-blue-800 underline" href={`mailto:${c.cliente.email}?subject=${encodeURIComponent("Come è andata la posa?")}&body=${encodeURIComponent(`Gentile ${c.cliente.nome},\n\ngrazie per averci scelto. Se è soddisfatto del lavoro, ci farebbe piacere una sua recensione.\n\nCordiali saluti`)}`}>✉ chiedi recensione al cliente</a>
                )}
                <form action={segnaRecensioneRichiesta}><input type="hidden" name="id" value={c.id} /><button className="text-neutral-700 underline">segna recensione richiesta</button></form>
                {c.recensioneRichiestaIl && <span className="text-green-900">richiesta il {c.recensioneRichiestaIl.toLocaleDateString("it-IT")}</span>}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ASSISTENZA */}
      <section className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-neutral-900">Assistenza ({c.assistenze.length})</h2>
          <Link href="/assistenza" className="text-xs text-blue-800 underline">tutte le assistenze</Link>
        </div>
        {c.assistenze.map((a) => (
          <p key={a.id} className="text-sm text-neutral-900 border-b border-neutral-100 py-1">
            #{a.numero} · <b>{a.stato}</b> · {a.descrizione}{a.inGaranzia ? "" : " (fuori garanzia)"}{a.dataIntervento ? ` · intervento ${a.dataIntervento.toLocaleDateString("it-IT")}` : ""}
          </p>
        ))}
        <form action={creaAssistenza} className="flex flex-wrap items-end gap-2 mt-3">
          <input type="hidden" name="commessaId" value={c.id} />
          <input name="prodotto" placeholder="Prodotto" className={`${inp} w-40`} />
          <input name="descrizione" required placeholder="Problema segnalato" className={`${inp} flex-1 min-w-48`} />
          <select name="priorita" className={inp}><option>NORMALE</option><option>URGENTE</option><option>BASSA</option></select>
          <button className="btn-3d btn-3d-orange text-xs px-3 py-1.5">Apri assistenza</button>
        </form>
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
