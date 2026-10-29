export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TIPI_DOCUMENTO } from "@/lib/fatture/fatturapa";
import { ratePagamento } from "@/lib/fatture/server";
import { numeroBolla, statoBolla } from "@/lib/magazzino/calcoli";
import { numeroCommessa } from "@/lib/commesse";
import { BRANDS } from "@/lib/brands";
import {
  salvaTestataFattura, salvaRigheFattura, aggiungiRigaFattura, togliRigaFattura, collegaBolle, abbinaFattura,
  registraFatturaAcquisto, riapriFatturaAcquisto, eliminaFatturaAcquisto,
} from "@/app/fatture-actions";
import Documenti from "@/components/documenti/Documenti";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });
const dataIt = (d?: Date | null) => (d ? d.toLocaleDateString("it-IT") : "—");
const iso = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";

export default async function FatturaAcquistoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await prisma.fatturaAcquisto.findUnique({ where: { id }, include: { righe: { orderBy: { posizione: "asc" } }, bolle: { include: { righe: { select: { rigaOrdineId: true } } } } } });
  if (!f) notFound();
  const modificabile = f.stato === "DA_VERIFICARE";
  const unAnnoFa = new Date(f.data); unAnnoFa.setUTCFullYear(unAnnoFa.getUTCFullYear() - 1);
  const [fornitori, commesse, bolleForn, righeOrdine, scadenze, forn] = await Promise.all([
    modificabile ? prisma.soggetto.findMany({ where: { attivo: true, ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" }, select: { id: true, ragioneSociale: true } }) : Promise.resolve([]),
    prisma.commessa.findMany({ where: { OR: [{ stato: { notIn: ["ANNULLATA"] }, createdAt: { gte: unAnnoFa } }, { id: { in: f.righe.map((r) => r.commessaId).filter(Boolean) as string[] } }] }, select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } }, orderBy: [{ anno: "desc" }, { numero: "desc" }], take: 400 }),
    f.fornitoreId ? prisma.bollaEntrata.findMany({ where: { fornitoreId: f.fornitoreId, OR: [{ stato: "DA_FATTURARE" }, { fatturaAcquistoId: f.id }] }, orderBy: [{ anno: "desc" }, { numero: "desc" }], take: 60 }) : Promise.resolve([]),
    f.fornitoreId ? prisma.rigaOrdine.findMany({ where: { OR: [{ ordineFornitore: { fornitoreId: f.fornitoreId, dataOrdine: { gte: unAnnoFa } } }, { id: { in: f.righe.map((r) => r.rigaOrdineId).filter(Boolean) as string[] } }] }, include: { ordineFornitore: { select: { numero: true, anno: true } } }, orderBy: { createdAt: "desc" }, take: 500 }) : Promise.resolve([]),
    prisma.scadenza.findMany({ where: { chiaveImport: { startsWith: `FA:${f.id}:` } }, orderBy: { dataScadenza: "asc" } }),
    f.fornitoreId ? prisma.soggetto.findUnique({ where: { id: f.fornitoreId }, select: { giorniPagamento: true } }) : Promise.resolve(null),
  ]);
  const collegate = new Set(f.bolle.map((b) => b.id));
  const rate = ratePagamento(f, forn?.giorniPagamento ?? null);
  const senzaCommessa = f.righe.filter((r) => !r.commessaId);
  const totRighe = f.righe.reduce((t, r) => t + r.importo, 0);
  const etichettaRiga = (r: (typeof righeOrdine)[number]) => `${r.ordineFornitore ? `ord. ${r.ordineFornitore.numero}/${r.ordineFornitore.anno} · ` : ""}${r.codiceFornitore ? r.codiceFornitore + " " : ""}${r.descrizione}`.slice(0, 90);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/amministrazione/fatture-acquisto" className="text-sm text-blue-800 underline">← Fatture d&apos;acquisto</Link>
          <h2 className="text-xl font-bold text-neutral-900">{TIPI_DOCUMENTO[f.tipoDocumento] ?? "Fattura"} {f.numero} del {dataIt(f.data)}</h2>
          <p className="text-sm text-neutral-700"><b>{f.fornitoreNome}</b>{f.partitaIva ? ` · P.IVA ${f.partitaIva}` : ""} · {f.divisione ?? "società non indicata"} · {f.origine === "XML" ? "fattura elettronica" : f.origine === "PDF" ? "da PDF" : "inserita a mano"}</p>
          {(f.riferimentiOrdine || f.riferimentiDdt) && <p className="text-xs text-neutral-600">{f.riferimentiOrdine ? `Ordini citati: ${f.riferimentiOrdine}` : ""}{f.riferimentiOrdine && f.riferimentiDdt ? " · " : ""}{f.riferimentiDdt ? `DDT citati: ${f.riferimentiDdt}` : ""}</p>}
          {!f.fornitoreId && <p className="text-xs text-amber-800">Fornitore non trovato in anagrafica: sceglilo qui sotto per collegare bolle e ordini.</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{eur(f.totale)}</p>
          <p className="text-xs text-neutral-600">imponibile {eur(f.imponibile)} · IVA {eur(f.iva)}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full ${modificabile ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>{modificabile ? "Da verificare" : `Registrata il ${dataIt(f.registrataIl)} da ${f.registrataDaNome ?? ""}`}</span>
        </div>
      </div>

      {modificabile && (
        <form action={salvaTestataFattura} className="bg-white border border-neutral-200 rounded-lg p-3 grid md:grid-cols-6 gap-2 items-end">
          <input type="hidden" name="id" value={f.id} />
          <label className="text-xs font-semibold md:col-span-2">Fornitore in anagrafica<select name="fornitoreId" defaultValue={f.fornitoreId ?? ""} className={`${inp} w-full`}><option value="">— {f.fornitoreNome} —</option>{fornitori.map((x) => <option key={x.id} value={x.id}>{x.ragioneSociale}</option>)}</select></label>
          <label className="text-xs font-semibold">Società<select name="divisione" defaultValue={f.divisione ?? ""} className={`${inp} w-full`}><option value="">—</option>{BRANDS.map((b) => <option key={b.nome}>{b.nome}</option>)}</select></label>
          {f.origine !== "XML" && <>
            <label className="text-xs font-semibold">Numero<input name="numero" defaultValue={f.numero} className={`${inp} w-full`} /></label>
            <label className="text-xs font-semibold">Data<input type="date" name="data" defaultValue={iso(f.data)} className={`${inp} w-full`} /></label>
            <label className="text-xs font-semibold">Imponibile<input name="imponibile" defaultValue={String(f.imponibile).replace(".", ",")} className={`${inp} w-full`} /></label>
            <label className="text-xs font-semibold">IVA<input name="iva" defaultValue={String(f.iva).replace(".", ",")} className={`${inp} w-full`} /></label>
            <label className="text-xs font-semibold">Totale<input name="totale" defaultValue={String(f.totale).replace(".", ",")} className={`${inp} w-full`} /></label>
          </>}
          <label className="text-xs font-semibold">Scadenza (una rata)<input type="date" name="scadenza" className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold md:col-span-3">Note<input name="note" defaultValue={f.note ?? ""} className={`${inp} w-full`} /></label>
          <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5">Salva</button>
        </form>
      )}

      {(bolleForn.length > 0 || f.bolle.length > 0) && (
        <section className="bg-white border border-neutral-200 rounded-lg p-4">
          <h3 className="font-bold mb-1">Bolle collegate</h3>
          {modificabile ? (
            <form action={collegaBolle}>
              <input type="hidden" name="id" value={f.id} />
              <div className="grid md:grid-cols-2 gap-1">
                {bolleForn.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="bolla" value={b.id} defaultChecked={collegate.has(b.id)} />
                    Bolla {numeroBolla(b)}{b.numeroDdt ? ` · DDT ${b.numeroDdt}` : ""} del {dataIt(b.dataDdt ?? b.dataArrivo)}
                    {f.riferimentiDdt && b.numeroDdt && f.riferimentiDdt.includes(b.numeroDdt) ? <span className="text-xs text-green-800">(citata in fattura)</span> : null}</label>
                ))}
              </div>
              <button className="btn-3d btn-3d-purple text-sm px-3 py-1.5 mt-2">Collega e abbina le righe</button>
            </form>
          ) : (
            <ul className="text-sm">{f.bolle.map((b) => <li key={b.id}><Link href={`/magazzino/bolle/${b.id}`} className="underline">Bolla {numeroBolla(b)}{b.numeroDdt ? ` · DDT ${b.numeroDdt}` : ""}</Link> <span className="text-xs" style={{ color: statoBolla(b.stato).colore }}>{statoBolla(b.stato).nome}</span></li>)}</ul>
          )}
        </section>
      )}

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="font-bold">Righe e ripartizione sulle commesse ({f.righe.length})</h3>
          {modificabile && <form action={abbinaFattura}><input type="hidden" name="id" value={f.id} /><button className="text-xs text-blue-800 underline">Abbina automaticamente agli ordini</button></form>}
        </div>
        <form action={salvaRigheFattura}>
          <input type="hidden" name="id" value={f.id} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200"><th className="py-1">Descrizione</th><th className="text-right">Q.tà</th><th className="text-right">Importo</th><th>Commessa</th><th>Riga d&apos;ordine (costo reale)</th><th></th></tr></thead>
              <tbody>
                {f.righe.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100 align-top">
                    <td className="py-1.5">{modificabile && f.origine !== "XML" ? <input name={`descr_${r.id}`} defaultValue={r.descrizione} className={`${inp} w-full`} /> : <>{r.codice ? <b className="text-xs">{r.codice} </b> : null}{r.descrizione}</>}</td>
                    <td className="text-right text-xs whitespace-nowrap">{r.quantita !== null ? `${String(r.quantita).replace(".", ",")} ${r.um ?? ""}` : ""}</td>
                    <td className="text-right whitespace-nowrap">{modificabile && f.origine !== "XML" ? <input name={`importo_${r.id}`} defaultValue={String(r.importo).replace(".", ",")} className={`${inp} w-24 text-right`} /> : eur(r.importo)}</td>
                    <td>{modificabile ? (
                      <select name={`commessa_${r.id}`} defaultValue={r.commessaId ?? ""} className={`${inp} w-52`}><option value="">— spese generali —</option>{commesse.map((c) => <option key={c.id} value={c.id}>{numeroCommessa(c)} {c.cliente.nome}</option>)}</select>
                    ) : (() => { const c = commesse.find((x) => x.id === r.commessaId); return c ? <Link href={`/commesse/${c.id}`} className="underline text-xs">{numeroCommessa(c)} {c.cliente.nome}</Link> : <span className="text-xs text-neutral-500">spese generali</span>; })()}</td>
                    <td>{modificabile ? (
                      <select name={`riga_${r.id}`} defaultValue={r.rigaOrdineId ?? ""} className={`${inp} w-72`}><option value="">—</option>{righeOrdine.map((x) => <option key={x.id} value={x.id}>{etichettaRiga(x)}</option>)}</select>
                    ) : <span className="text-xs">{(() => { const x = righeOrdine.find((y) => y.id === r.rigaOrdineId); return x ? etichettaRiga(x) : "—"; })()}</span>}</td>
                    <td>{modificabile && f.origine !== "XML" && f.righe.length > 1 && <button name="rigaId" value={r.id} formAction={togliRigaFattura} className="text-xs text-red-700 underline">togli</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Math.abs(totRighe - f.imponibile) > 0.05 && <p className="text-xs text-amber-800 mt-1">Le righe sommano {eur(totRighe)}, l&apos;imponibile è {eur(f.imponibile)}{f.origine === "XML" ? " (sconti o arrotondamenti in fattura)" : ": aggiungi o correggi le righe"}.</p>}
          {modificabile && <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5 mt-2">Salva ripartizione</button>}
        </form>
        {modificabile && f.origine !== "XML" && (
          <form action={aggiungiRigaFattura} className="flex flex-wrap gap-2 items-end mt-3 border-t border-neutral-200 pt-3">
            <input type="hidden" name="id" value={f.id} />
            <span className="text-xs font-bold w-full">+ Dividi su più commesse: aggiungi una riga</span>
            <input name="descrizione" placeholder="Descrizione" className={`${inp} flex-1 min-w-48`} />
            <input name="importo" placeholder="Importo €" required className={`${inp} w-28`} />
            <select name="commessaId" defaultValue="" className={`${inp} w-52`}><option value="">— spese generali —</option>{commesse.map((c) => <option key={c.id} value={c.id}>{numeroCommessa(c)} {c.cliente.nome}</option>)}</select>
            <button className="btn-3d btn-3d-purple text-[11px] px-2 py-1">Aggiungi</button>
          </form>
        )}
      </section>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h3 className="font-bold mb-1">Pagamento</h3>
        {scadenze.length ? (
          <ul className="text-sm">{scadenze.map((s) => <li key={s.id}>{dataIt(s.dataScadenza)} · {eur(s.importo)} · {s.descrizione} <span className="text-xs text-neutral-600">({s.stato.toLowerCase()})</span></li>)}</ul>
        ) : f.totale < 0 ? <p className="text-sm text-neutral-600">Nota di credito: riduce il debito verso il fornitore, nessuna scadenza.</p> : (
          <ul className="text-sm text-neutral-700">{rate.map((r, i) => <li key={i}>{dataIt(r.data)} · {eur(r.importo)}{r.modalita ? ` · ${r.modalita}` : ""} <span className="text-xs text-neutral-500">(entra nello scadenzario alla registrazione)</span></li>)}</ul>
        )}
        <Link href="/amministrazione/scadenzario" className="text-xs underline">Apri lo scadenzario</Link>
      </section>

      {modificabile ? (
        <section className="bg-green-50 border border-green-300 rounded-lg p-4 flex flex-wrap items-center gap-3">
          <form action={registraFatturaAcquisto}><input type="hidden" name="id" value={f.id} /><button className="btn-3d btn-3d-green text-sm px-4 py-2">Registra la fattura</button></form>
          <span className="text-sm text-neutral-700">Mette i costi reali sulle commesse{senzaCommessa.length ? ` (${senzaCommessa.length} righe restano spese generali)` : ""}, segna le bolle come fatturate e crea le scadenze di pagamento.</span>
          <form action={eliminaFatturaAcquisto} className="ml-auto"><input type="hidden" name="id" value={f.id} /><button className="text-xs text-red-700 underline">elimina (caricata per errore)</button></form>
        </section>
      ) : (
        <form action={riapriFatturaAcquisto} className="flex items-center gap-2"><input type="hidden" name="id" value={f.id} /><button className="btn-3d btn-3d-dark text-sm px-3 py-1.5">Riapri per correggere</button><span className="text-xs text-neutral-500">Possibile solo se le scadenze non hanno ancora pagamenti.</span></form>
      )}

      <Documenti entita="FATTURA_ACQUISTO" entitaId={f.id} titolo="Documenti della fattura (PDF, allegati)" />
    </div>
  );
}
