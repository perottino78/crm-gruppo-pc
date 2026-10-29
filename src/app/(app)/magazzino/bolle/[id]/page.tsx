export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { righeDaRicevere } from "@/lib/magazzino/server";
import { statoBolla, numeroBolla, CAUSALI_BOLLA, ESITI_RIGA, righeDaControllare, quantitaUtile } from "@/lib/magazzino/calcoli";
import { numeroOrdine } from "@/lib/ordini/calcoli";
import { numeroCommessa } from "@/lib/commesse";
import { aiDisponibile } from "@/lib/articoli/ai";
import { salvaTestataBolla, aggiungiRigheDaOrdini, aggiungiRigaBolla, salvaSpunta, togliRigaBolla, registraBolla, riapriBolla, annullaBolla } from "@/app/magazzino-actions";
import LeggiBollaAI from "@/components/magazzino/LeggiBollaAI";
import Documenti from "@/components/documenti/Documenti";

const dataIt = (d?: Date | null) => (d ? d.toLocaleDateString("it-IT") : "—");
const iso = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const q = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";

export default async function BollaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await prisma.bollaEntrata.findUnique({ where: { id }, include: { righe: { orderBy: { posizione: "asc" } }, fatturaAcquisto: { select: { id: true, numero: true } } } });
  if (!b) notFound();
  const aperta = b.stato === "APERTA";
  const s = statoBolla(b.stato);
  const [daRicevere, ordini, commesse, catalogo, commesseAperte] = await Promise.all([
    aperta && b.fornitoreId ? righeDaRicevere(b.fornitoreId) : Promise.resolve([]),
    prisma.ordineFornitore.findMany({ where: { id: { in: [...new Set(b.righe.map((r) => r.ordineFornitoreId).filter(Boolean))] as string[] } }, select: { id: true, numero: true, anno: true } }),
    prisma.commessa.findMany({ where: { id: { in: [...new Set(b.righe.map((r) => r.commessaId).filter(Boolean))] as string[] } }, select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } } }),
    aperta ? prisma.articolo.findMany({ where: { attivo: true, ...(b.fornitoreId ? { fornitoreId: b.fornitoreId } : {}) }, select: { codice: true, descrizione: true }, orderBy: { codice: "asc" }, take: 3000 }) : Promise.resolve([]),
    aperta ? prisma.commessa.findMany({ where: { stato: { notIn: ["CHIUSA", "ANNULLATA"] } }, select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } }, orderBy: [{ anno: "desc" }, { numero: "desc" }], take: 300 }) : Promise.resolve([]),
  ]);
  const gia = new Set(b.righe.map((r) => r.rigaOrdineId));
  const proponibili = daRicevere.filter((r) => !gia.has(r.id));
  const perOrdine = new Map<string, typeof proponibili>();
  for (const r of proponibili) { const k = r.ordineFornitore ? numeroOrdine(r.ordineFornitore) : "—"; perOrdine.set(k, [...(perOrdine.get(k) ?? []), r]); }
  const daControllare = righeDaControllare(b.righe);
  const ordineDi = (oid: string | null) => ordini.find((o) => o.id === oid);
  const commessaDi = (cid: string | null) => commesse.find((c) => c.id === cid);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/magazzino/bolle" className="text-sm text-blue-800 underline">← Bolle d&apos;entrata</Link>
          <h2 className="text-xl font-bold text-neutral-900">Bolla {numeroBolla(b)} · {b.fornitoreNome}</h2>
          <p className="text-sm text-neutral-700">{CAUSALI_BOLLA[b.causale] ?? b.causale} · arrivata il {dataIt(b.dataArrivo)}{b.numeroDdt ? ` · DDT ${b.numeroDdt}` : ""}{b.dataDdt ? ` del ${dataIt(b.dataDdt)}` : ""}{b.creatoDaNome ? ` · inserita da ${b.creatoDaNome}` : ""}</p>
          {b.registrataIl && <p className="text-xs text-neutral-600">Registrata il {b.registrataIl.toLocaleString("it-IT")} da {b.registrataDaNome}</p>}
        </div>
        <div className="text-right">
          <span className="text-sm px-3 py-1 rounded-full text-white" style={{ background: s.colore }}>{s.nome}</span>
          {b.fatturaAcquisto && <Link href={`/amministrazione/fatture-acquisto/${b.fatturaAcquisto.id}`} className="block text-xs underline mt-1">Fattura {b.fatturaAcquisto.numero}</Link>}
        </div>
      </div>

      {b.stato !== "ANNULLATA" && (
        <form action={salvaTestataBolla} className="bg-white border border-neutral-200 rounded-lg p-3 grid md:grid-cols-6 gap-2 items-end">
          <input type="hidden" name="id" value={b.id} />
          <label className="text-xs font-semibold">N° DDT<input name="numeroDdt" defaultValue={b.numeroDdt ?? ""} className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold">Data DDT<input type="date" name="dataDdt" defaultValue={iso(b.dataDdt)} className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold">Arrivata il<input type="date" name="dataArrivo" defaultValue={iso(b.dataArrivo)} className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold">Causale<select name="causale" defaultValue={b.causale} disabled={!aperta} className={`${inp} w-full`}>{Object.entries(CAUSALI_BOLLA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-xs font-semibold md:col-span-2">Riferimento<input name="riferimento" defaultValue={b.riferimento ?? ""} className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold md:col-span-5">Note<input name="note" defaultValue={b.note ?? ""} className={`${inp} w-full`} /></label>
          <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5">Salva</button>
        </form>
      )}

      {aperta && (
        <section className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
          <h3 className="font-bold">1. Cosa è arrivato</h3>
          <LeggiBollaAI bollaId={b.id} attiva={aiDisponibile()} />
          {b.fornitoreId ? (
            proponibili.length ? (
              <form action={aggiungiRigheDaOrdini} className="border border-neutral-200 rounded p-2">
                <input type="hidden" name="bollaId" value={b.id} />
                <p className="text-sm font-semibold mb-1">Righe ordinate a {b.fornitoreNome} non ancora arrivate ({proponibili.length})</p>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {[...perOrdine.entries()].map(([nr, righe]) => (
                    <div key={nr}>
                      <p className="text-xs font-bold text-neutral-600">Ordine {nr}{righe[0].commessa ? ` · commessa ${numeroCommessa(righe[0].commessa)} ${righe[0].commessa.cliente.nome}` : " · scorta magazzino"}{righe[0].ordineFornitore?.consegnaConfermata ? ` · consegna confermata ${dataIt(righe[0].ordineFornitore.consegnaConfermata)}` : ""}</p>
                      {righe.map((r) => (
                        <label key={r.id} className="flex items-start gap-2 text-sm py-0.5"><input type="checkbox" name="rigaOrdine" value={r.id} className="mt-1" />
                          <span>{r.codiceFornitore ? <b>{r.codiceFornitore} </b> : null}{r.descrizione} <span className="text-neutral-500">× {q(r.quantita - r.quantitaArrivata)} {r.um ?? "pz"}{r.quantitaArrivata > 0 ? ` (già arrivati ${q(r.quantitaArrivata)} su ${r.quantita})` : ""}</span></span></label>
                      ))}
                    </div>
                  ))}
                </div>
                <button className="btn-3d btn-3d-purple text-sm px-3 py-1.5 mt-2">Aggiungi le righe spuntate alla bolla</button>
              </form>
            ) : <p className="text-sm text-neutral-500">Nessuna riga ancora da ricevere negli ordini a {b.fornitoreNome}.</p>
          ) : <p className="text-sm text-amber-800">Fornitore non in anagrafica: aggiungi le righe a mano qui sotto.</p>}
          <form action={aggiungiRigaBolla} className="grid grid-cols-2 md:grid-cols-12 gap-1.5 items-end border-t border-neutral-200 pt-3">
            <input type="hidden" name="bollaId" value={b.id} />
            <span className="text-xs font-bold md:col-span-12">+ Riga non ordinata (dal catalogo o libera)</span>
            <input name="articolo" list={`cat-${b.id}`} placeholder="Articolo dal catalogo (facoltativo)" className={`${inp} col-span-2 md:col-span-4`} />
            <datalist id={`cat-${b.id}`}>{catalogo.map((a) => <option key={a.codice} value={`${a.codice} — ${a.descrizione}`} />)}</datalist>
            <input name="descrizione" placeholder="…oppure descrizione" className={`${inp} col-span-2 md:col-span-3`} />
            <input name="quantita" placeholder="Q.tà" defaultValue="1" className={`${inp} md:col-span-1`} />
            <input name="prezzo" placeholder="Prezzo €" className={`${inp} md:col-span-1`} />
            <select name="commessaId" className={`${inp} col-span-2 md:col-span-2`} defaultValue=""><option value="">→ a scorta (magazzino)</option>{commesseAperte.map((c) => <option key={c.id} value={c.id}>→ {numeroCommessa(c)} {c.cliente.nome}</option>)}</select>
            <button className="btn-3d btn-3d-purple text-[11px] px-2 py-1 md:col-span-1">Aggiungi</button>
          </form>
        </section>
      )}

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h3 className="font-bold mb-2">{aperta ? "2. Spunta del materiale" : "Materiale della bolla"} ({b.righe.length} righe)</h3>
        {b.righe.length === 0 ? <p className="text-sm text-neutral-500">Nessuna riga ancora.</p> : (
          <form action={salvaSpunta}>
            <input type="hidden" name="bollaId" value={b.id} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200"><th className="py-1">#</th><th>Articolo</th><th>Per</th><th className="text-right">Q.tà bolla</th><th>Ricevuta</th><th>Esito</th><th>Destinazione</th><th>Note</th><th></th></tr></thead>
                <tbody>
                  {b.righe.map((r) => {
                    const o = ordineDi(r.ordineFornitoreId), c = commessaDi(r.commessaId);
                    const e = ESITI_RIGA[r.esito] ?? ESITI_RIGA.DA_CONTROLLARE;
                    return (
                      <tr key={r.id} className="border-b border-neutral-100 align-top">
                        <td className="py-1.5 text-xs text-neutral-500">{r.posizione}</td>
                        <td>{r.codiceFornitore || r.codice ? <b className="text-xs">{r.codiceFornitore ?? r.codice} </b> : null}{r.descrizione}{!r.rigaOrdineId && <span className="block text-[11px] text-amber-800">non collegata a un ordine</span>}</td>
                        <td className="text-xs">{c ? <Link href={`/commesse/${c.id}#materiale`} className="underline">{numeroCommessa(c)} {c.cliente.nome}</Link> : "scorta"}{o ? <Link href={`/ordini-fornitori/${o.id}`} className="block text-neutral-500 underline">ord. {numeroOrdine(o)}</Link> : null}</td>
                        <td className="text-right">{q(r.quantitaBolla)} {r.um ?? ""}</td>
                        {aperta ? (
                          <>
                            <td><input name={`q_${r.id}`} defaultValue={q(r.quantitaRicevuta)} placeholder={q(r.quantitaBolla)} className={`${inp} w-20`} /></td>
                            <td><select name={`esito_${r.id}`} defaultValue={r.esito} className={`${inp} ${e.cls}`}>{Object.entries(ESITI_RIGA).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}</select></td>
                            <td><select name={`dest_${r.id}`} defaultValue={r.destinazione} className={inp}><option value="COMMESSA" disabled={!r.commessaId}>Commessa</option><option value="MAGAZZINO">Magazzino (scorta)</option></select>{r.destinazione === "MAGAZZINO" && !r.articoloId && <span className="block text-[11px] text-amber-800">senza articolo: non entra in giacenza</span>}</td>
                            <td><input name={`note_${r.id}`} defaultValue={r.note ?? ""} className={`${inp} w-40`} /></td>
                            <td><button name="rigaId" value={r.id} formAction={togliRigaBolla} className="text-xs text-red-700 underline">togli</button></td>
                          </>
                        ) : (
                          <>
                            <td>{q(quantitaUtile(r))}</td>
                            <td><span className={`text-xs px-2 py-0.5 rounded-full ${e.cls}`}>{e.nome}</span></td>
                            <td className="text-xs">{r.destinazione === "MAGAZZINO" ? "Magazzino" : "Commessa"}{r.movimentoId ? " · caricato" : ""}</td>
                            <td className="text-xs">{r.note ?? ""}</td><td></td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {aperta && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5">Salva la spunta</button>
                {daControllare > 0 && <button name="tuttoOk" value="1" className="btn-3d btn-3d-green text-sm px-3 py-1.5">✓ Tutto arrivato come da bolla ({daControllare} righe)</button>}
                <span className="text-xs text-neutral-500 self-center">Se la quantità ricevuta è inferiore la riga diventa «parziale»: il resto resta in attesa sull&apos;ordine.</span>
              </div>
            )}
          </form>
        )}
      </section>

      {aperta && b.righe.length > 0 && (
        <section className={`rounded-lg p-4 border ${daControllare ? "bg-neutral-50 border-neutral-200" : "bg-green-50 border-green-300"}`}>
          <h3 className="font-bold mb-1">3. Registra la bolla</h3>
          {daControllare ? <p className="text-sm text-neutral-700">Prima spunta tutte le righe: ne restano {daControllare} da controllare.</p> : (
            <form action={registraBolla} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="bollaId" value={b.id} />
              <button className="btn-3d btn-3d-green text-sm px-4 py-2">Registra arrivo</button>
              <span className="text-sm text-neutral-700">Aggiorna gli ordini, carica a magazzino le righe a scorta e, se una commessa ha tutto il materiale, la avvia (task a fatturazione e posa).</span>
            </form>
          )}
        </section>
      )}

      {["DA_FATTURARE", "CHIUSA"].includes(b.stato) && (
        <form action={riapriBolla} className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="bollaId" value={b.id} />
          <button className="btn-3d btn-3d-dark text-sm px-3 py-1.5">Riapri per correggere</button>
          <span className="text-xs text-neutral-500">Storna arrivi e carichi; poi si registra di nuovo.</span>
        </form>
      )}

      <Documenti entita="BOLLA_ENTRATA" entitaId={b.id} titolo="Documenti della bolla (foto, PDF, contestazioni)" />

      {aperta && (
        <details className="bg-white border border-red-200 rounded-lg p-3">
          <summary className="cursor-pointer text-sm text-red-800">Annulla bolla</summary>
          <form action={annullaBolla} className="flex flex-wrap gap-2 items-center mt-2">
            <input type="hidden" name="bollaId" value={b.id} />
            <input name="motivo" placeholder="Motivo" className={inp} />
            <button className="btn-3d btn-3d-red text-sm px-3 py-1.5">Annulla la bolla</button>
          </form>
        </details>
      )}
    </div>
  );
}
