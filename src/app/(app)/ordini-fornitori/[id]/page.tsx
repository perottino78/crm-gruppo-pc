export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoGestireOrdini } from "@/lib/ordini/server";
import { statoOrdine, numeroOrdine, totaleOrdine, importoRiga } from "@/lib/ordini/calcoli";
import { BRANDS } from "@/lib/brands";
import {
  salvaTestataOrdine, salvaRigaOrdineFornitore, aggiungiRigaAOrdine, togliRigaDaOrdine, segnaOrdineInviatoAMano,
  registraConfermaFornitore, registraArrivi, annullaOrdine,
} from "@/app/ordini-actions";
import InviaOrdine from "@/components/ordini/InviaOrdine";
import Documenti from "@/components/documenti/Documenti";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });
const dataIt = (d?: Date | null) => (d ? d.toLocaleDateString("it-IT") : "—");
const iso = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";

export default async function OrdineFornitorePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !puoGestireOrdini(u)) notFound();
  const { id } = await params;
  const o = await prisma.ordineFornitore.findUnique({ where: { id }, include: { fornitore: true, commessa: { include: { cliente: true } }, righe: { orderBy: { createdAt: "asc" } } } });
  if (!o) notFound();
  const s = statoOrdine(o.stato);
  const bozza = o.stato === "BOZZA", annullato = o.stato === "ANNULLATO";
  const t = totaleOrdine(o.righe);
  const nr = numeroOrdine(o);
  const emailForn = o.fornitore.emailOrdini ?? o.fornitore.email ?? "";
  const oggetto = `Ordine ${nr} - ${o.divisione === "Work & Services" ? "Work & Services S.r.l." : "P&C S.r.l."}${o.clienteFinale ? ` - rif. ${o.clienteFinale.split(" - ")[0]}` : ""}`;
  const testo = `Buongiorno,\n\nin allegato il nostro ordine n. ${nr}${o.consegnaRichiesta ? ` con consegna richiesta entro il ${dataIt(o.consegnaRichiesta)}` : ""}.\nVi chiediamo cortesemente di inviarci conferma d'ordine con data di consegna, citando il nostro numero d'ordine.\n\nGrazie, cordiali saluti\n${u.nome}\nUfficio ordini ${o.divisione === "Work & Services" ? "Work & Services S.r.l." : "P&C S.r.l."}\nTel. 011 1988 7497`;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/ordini-fornitori" className="text-sm text-blue-800 underline">← Ordini fornitori</Link>
          <h1 className="text-2xl font-bold text-neutral-900">Ordine fornitore {nr}</h1>
          <p className="text-sm text-neutral-700"><b>{o.fornitore.ragioneSociale}</b> · del {dataIt(o.dataOrdine)} · {o.divisione ?? "P&C"}{o.creatoDaNome ? ` · emesso da ${o.creatoDaNome}` : ""}
            {o.commessa && <> · commessa <Link href={`/commesse/${o.commessaId}#acquisti`} className="underline">{o.commessa.numero}/{o.commessa.anno} ({o.commessa.cliente.nome})</Link></>}</p>
        </div>
        <span className="text-sm px-3 py-1 rounded-full text-white" style={{ background: s.colore }}>{s.nome}</span>
      </div>
      {o.inviatoIl && <p className="text-xs text-neutral-600">Inviato il {o.inviatoIl.toLocaleString("it-IT")} {o.inviatoA ? `a ${o.inviatoA}` : ""} ({o.modalitaInvio === "EMAIL" ? "email dal CRM" : "a mano"}) da {o.inviatoDaNome}</p>}

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h2 className="font-bold mb-2">Dati dell&apos;ordine</h2>
        <form action={salvaTestataOrdine} className="grid md:grid-cols-3 gap-2">
          <input type="hidden" name="id" value={o.id} />
          <label className="text-xs font-semibold">Consegna richiesta<input type="date" name="consegnaRichiesta" defaultValue={iso(o.consegnaRichiesta)} className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold">Società / divisione<select name="divisione" defaultValue={o.divisione ?? "P&C"} className={`${inp} w-full`}>{BRANDS.map((b) => <option key={b.nome}>{b.nome}</option>)}</select></label>
          <label className="text-xs font-semibold">Trasporto<input name="trasporto" defaultValue={o.trasporto ?? ""} placeholder="es. a cura del fornitore / vettore" className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold md:col-span-2">Cliente finale<input name="clienteFinale" defaultValue={o.clienteFinale ?? ""} className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold">Indirizzo di consegna<input name="indirizzoSpedizione" defaultValue={o.indirizzoSpedizione ?? ""} className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold md:col-span-3">Riferimento<input name="riferimento" defaultValue={o.riferimento ?? ""} className={`${inp} w-full`} /></label>
          <label className="text-xs font-semibold md:col-span-3">Note per il fornitore (stampate sull&apos;ordine)<textarea name="note" defaultValue={o.note ?? ""} rows={2} className={`${inp} w-full`} /></label>
          {!annullato && <div><button className="btn-3d btn-3d-blue text-sm px-3 py-1.5">Salva dati</button></div>}
        </form>
      </section>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h2 className="font-bold mb-2">Righe ({o.righe.length}){t.totale ? ` · totale imponibile ${eur(t.totale)}` : ""}{t.righeSenzaPrezzo && t.totale ? ` (${t.righeSenzaPrezzo} senza prezzo)` : ""}</h2>
        <div className="space-y-2">
          {o.righe.map((r, i) => (
            <form key={r.id} action={salvaRigaOrdineFornitore} className={`border rounded p-2 grid grid-cols-2 md:grid-cols-12 gap-1.5 items-end ${r.arrivato ? "bg-green-50 border-green-300" : "border-neutral-200"}`}>
              <input type="hidden" name="rigaId" value={r.id} />
              <span className="text-xs font-bold text-neutral-500 md:col-span-12">Riga {i + 1}{r.arrivato ? ` · arrivata il ${dataIt(r.arrivatoIl)}` : ""}{r.costoPrevisto !== null ? ` · costo previsto da listino ${eur(r.costoPrevisto)}` : ""}</span>
              <label className="text-[11px] md:col-span-2">Codice<input name="codice" defaultValue={r.codice ?? ""} className={`${inp} w-full`} /></label>
              <label className="text-[11px] md:col-span-2">Cod. fornitore<input name="codiceFornitore" defaultValue={r.codiceFornitore ?? ""} className={`${inp} w-full`} /></label>
              <label className="text-[11px] col-span-2 md:col-span-8">Descrizione<input name="descrizione" defaultValue={r.descrizione} className={`${inp} w-full`} /></label>
              <label className="text-[11px] md:col-span-1">Q.tà<input name="quantita" defaultValue={r.quantita} className={`${inp} w-full`} /></label>
              <label className="text-[11px] md:col-span-1">UM<input name="um" defaultValue={r.um ?? "pz"} className={`${inp} w-full`} /></label>
              <label className="text-[11px] md:col-span-2">Prezzo unit. €<input name="prezzoAcquisto" defaultValue={r.prezzoAcquisto ?? ""} placeholder="facoltativo" className={`${inp} w-full`} /></label>
              <label className="text-[11px] md:col-span-1">Sconto %<input name="scontoAcquisto" defaultValue={r.scontoAcquisto ?? ""} className={`${inp} w-full`} /></label>
              <label className="text-[11px] md:col-span-4">Note riga<input name="note" defaultValue={r.note ?? ""} className={`${inp} w-full`} /></label>
              <span className="text-xs md:col-span-1">{importoRiga(r) !== null ? eur(importoRiga(r)!) : ""}</span>
              {!annullato && <div className="flex gap-2 md:col-span-2"><button className="btn-3d btn-3d-blue text-[11px] px-2 py-1">salva</button>
                {bozza && <button formAction={togliRigaDaOrdine} className="text-[11px] text-red-700 underline">togli</button>}</div>}
            </form>
          ))}
          {o.righe.length === 0 && <p className="text-sm text-neutral-500">Nessuna riga: aggiungile qui sotto.</p>}
        </div>
        {!annullato && !["EVASO"].includes(o.stato) && (
          <form action={aggiungiRigaAOrdine} className="mt-3 grid grid-cols-2 md:grid-cols-12 gap-1.5 items-end border-t border-neutral-200 pt-3">
            <input type="hidden" name="ordineId" value={o.id} />
            <span className="text-xs font-bold md:col-span-12">+ Aggiungi riga</span>
            <input name="codice" placeholder="Codice" className={`${inp} md:col-span-2`} />
            <input name="codiceFornitore" placeholder="Cod. fornitore" className={`${inp} md:col-span-2`} />
            <input name="descrizione" required placeholder="Descrizione" className={`${inp} col-span-2 md:col-span-4`} />
            <input name="quantita" placeholder="Q.tà" defaultValue="1" className={`${inp} md:col-span-1`} />
            <input name="um" placeholder="UM" defaultValue="pz" className={`${inp} md:col-span-1`} />
            <input name="prezzoAcquisto" placeholder="Prezzo €" className={`${inp} md:col-span-1`} />
            <button className="btn-3d btn-3d-purple text-[11px] px-2 py-1 md:col-span-1">Aggiungi</button>
          </form>
        )}
      </section>

      {!annullato && o.righe.length > 0 && (
        <section className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="font-bold mb-2">{bozza ? "Invia l'ordine al fornitore" : "Reinvia o scarica l'ordine"}</h2>
          {!emailForn && <p className="text-xs text-amber-800 mb-2">Il fornitore non ha l&apos;email ordini in anagrafica: inseriscila qui sotto (e poi in Impostazioni → Anagrafica per le prossime volte).</p>}
          <InviaOrdine ordineId={o.id} a={emailForn} cc="" oggetto={oggetto} testo={testo} pdfUrl={`/api/ordini-fornitori/${o.id}/pdf`} giaInviato={!bozza} />
          {bozza && (
            <form action={segnaOrdineInviatoAMano} className="mt-3 flex flex-wrap gap-2 items-center border-t border-neutral-200 pt-3">
              <input type="hidden" name="id" value={o.id} />
              <span className="text-sm">Hai inviato il PDF in altro modo (posta, portale del fornitore, WhatsApp)?</span>
              <input name="a" placeholder="a chi / come" className={inp} />
              <button className="btn-3d btn-3d-dark text-sm px-3 py-1.5">Segna come inviato</button>
            </form>
          )}
        </section>
      )}

      {!bozza && !annullato && (
        <div className="grid md:grid-cols-2 gap-4">
          <section className="bg-white border border-neutral-200 rounded-lg p-4">
            <h2 className="font-bold mb-2">Conferma del fornitore</h2>
            <form action={registraConfermaFornitore} className="space-y-2">
              <input type="hidden" name="id" value={o.id} />
              <label className="text-xs font-semibold block">N° conferma del fornitore<input name="numeroConfermaFornitore" defaultValue={o.numeroConfermaFornitore ?? ""} className={`${inp} w-full`} /></label>
              <label className="text-xs font-semibold block">Consegna confermata<input type="date" name="consegnaConfermata" defaultValue={iso(o.consegnaConfermata)} className={`${inp} w-full`} /></label>
              <button className="btn-3d btn-3d-purple text-sm px-3 py-1.5">Salva conferma</button>
              <p className="text-xs text-neutral-500">La conferma d&apos;ordine del fornitore (PDF) caricala nei documenti qui sotto, cartella «Conferma del fornitore».</p>
            </form>
          </section>
          <section className="bg-white border border-neutral-200 rounded-lg p-4">
            <h2 className="font-bold mb-2">Arrivo merce</h2>
            <form action={registraArrivi} className="space-y-1">
              <input type="hidden" name="id" value={o.id} />
              {o.righe.map((r) => (
                <label key={r.id} className="flex items-start gap-2 text-sm"><input type="checkbox" name="arrivata" value={r.id} defaultChecked={r.arrivato} className="mt-1" />
                  <span>{r.descrizione} <span className="text-neutral-500">× {r.quantita} {r.um ?? ""}</span></span></label>
              ))}
              <button className="btn-3d btn-3d-green text-sm px-3 py-1.5 mt-2">Registra arrivi</button>
            </form>
          </section>
        </div>
      )}

      <Documenti entita="ORDINE_FORNITORE" entitaId={o.id} titolo="Documenti dell'ordine (conferma, DDT, fattura)" />

      {!annullato && (
        <details className="bg-white border border-red-200 rounded-lg p-3">
          <summary className="cursor-pointer text-sm text-red-800">Annulla ordine</summary>
          <form action={annullaOrdine} className="flex flex-wrap gap-2 items-center mt-2">
            <input type="hidden" name="id" value={o.id} />
            <input name="motivo" placeholder="Motivo" className={inp} />
            <button className="btn-3d btn-3d-red text-sm px-3 py-1.5">Annulla l&apos;ordine</button>
            <span className="text-xs text-neutral-600">Le righe della commessa tornano «da ordinare».</span>
          </form>
        </details>
      )}
    </div>
  );
}
