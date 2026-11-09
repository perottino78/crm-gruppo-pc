export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { numeroCommessa } from "@/lib/commesse";
import { perInput } from "@/lib/calendario/tempo";
import { ASPETTO_BENI, CAUSALI_TRASPORTO, CODICI_IVA, PORTO, STATI_DDT, TRASPORTO_A_CURA, UNITA_MISURA, codiceIvaDa } from "@/lib/fatturazione/tabelle";
import { importoRiga, numeroDdt } from "@/lib/fatturazione/calcoli";
import { emissioneReale } from "@/lib/fatturazione/server";
import { salvaTestataDdt, salvaRigheDdt, confermaDdt, cambiaStatoDdt, eliminaDdt, fatturaDaDdt } from "@/app/fatturazione-actions";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm w-full disabled:bg-neutral-50 disabled:text-neutral-700";

export default async function DdtPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ errore?: string; salvato?: string; confermato?: string }> }) {
  const { id } = await params;
  const msg = await searchParams;
  const d = await prisma.ddtUscita.findUnique({ where: { id }, include: { righe: { orderBy: [{ posizione: "asc" }, { id: "asc" }] }, fattura: { select: { id: true, numero: true, stato: true } } } });
  if (!d) notFound();
  const [commessa, reale] = await Promise.all([
    d.commessaId ? prisma.commessa.findUnique({ where: { id: d.commessaId }, select: { id: true, numero: true, anno: true } }) : null,
    emissioneReale(),
  ]);
  const modificabile = d.stato !== "FATTURATO";
  const stato = STATI_DDT[d.stato];
  const imponibile = d.righe.reduce((t, r) => t + importoRiga(r), 0);
  const daFatturare = ["DA_FATTURARE", "PARZ_FATTURATO"].includes(d.stato);

  return (
    <div className="space-y-4">
      {msg.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">⚠️ {msg.errore}</p>}
      {msg.salvato && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✓ Salvato</p>}
      {msg.confermato && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✓ DDT n. {numeroDdt(d)} confermato: stampa il PDF in due copie e fallo firmare alla consegna.</p>}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/fatturazione/ddt" className="btn-indietro">← DDT di uscita</Link>
          <h2 className="text-xl font-bold text-neutral-900">DDT {d.causale} {d.numero ? `n. ${numeroDdt(d)}` : "(bozza)"} del {dataIt(d.data)}</h2>
          <p className="text-sm text-neutral-700">
            <b>{d.clienteNome}</b> · <span className="font-semibold" style={{ color: stato?.colore }}>{stato?.nome}</span>
            {commessa && <> · <Link href={`/commesse/${commessa.id}`} className="underline">commessa {numeroCommessa(commessa)}</Link></>}
            {d.clienteId && <> · <Link href={`/clienti/${d.clienteId}`} className="underline">scheda cliente</Link></>}
            {d.fattura && <> · in fattura <Link href={`/fatturazione/fatture/${d.fattura.id}`} className="underline">{d.fattura.numero ?? "bozza"}</Link></>}
          </p>
          {d.emessoDaNome && <p className="text-xs text-neutral-600">Confermato da {d.emessoDaNome}</p>}
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          <a href={`/api/fatturazione/ddt/${d.id}/pdf`} target="_blank" rel="noreferrer" className="btn-3d btn-3d-outline text-sm px-3 py-1.5">📄 {d.numero ? "Stampa PDF" : "Anteprima PDF"}</a>
          {daFatturare && <form action={fatturaDaDdt}><input type="hidden" name="ddtId" value={d.id} /><input type="hidden" name="ritorno" value={`/fatturazione/ddt/${d.id}`} /><button className="btn-3d btn-3d-green text-sm px-3 py-1.5">🧾 Crea fattura</button></form>}
          {d.numero && d.stato !== "FATTURATO" && <form action={cambiaStatoDdt}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="azione" value={d.stato === "CHIUSO" ? "riapri" : "chiudi"} /><button className="btn-3d btn-3d-outline text-sm px-3 py-1.5">{d.stato === "CHIUSO" ? "Riapri (da fatturare)" : "Chiudi: non da fatturare"}</button></form>}
          {(!d.numero || d.prova) && !d.righe.some((r) => r.fatturata) && <form action={eliminaDdt}><input type="hidden" name="id" value={d.id} /><button className="btn-3d btn-3d-red text-sm px-3 py-1.5">Elimina</button></form>}
        </div>
      </div>

      <form action={salvaTestataDdt} className="card-fase">
        <input type="hidden" name="id" value={d.id} />
        <fieldset disabled={!modificabile} className="space-y-3 min-w-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-neutral-700">Data<input type="date" name="data" defaultValue={d.data.toISOString().slice(0, 10)} className={inp} /></label>
            <label className="text-xs text-neutral-700">Causale del trasporto<select name="causale" defaultValue={d.causale} className={inp}>{CAUSALI_TRASPORTO.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="text-xs text-neutral-700">Trasporto a cura<select name="trasportoACura" defaultValue={d.trasportoACura} className={inp}>{TRASPORTO_A_CURA.map((c) => <option key={c.codice} value={c.codice}>{c.nome}</option>)}</select></label>
            <label className="text-xs text-neutral-700">Vettore / corriere<input name="vettore" defaultValue={d.vettore ?? ""} className={inp} /></label>
            <label className="text-xs text-neutral-700">Aspetto dei beni<select name="aspettoBeni" defaultValue={d.aspettoBeni ?? ""} className={inp}><option value="">—</option>{ASPETTO_BENI.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="text-xs text-neutral-700">N. colli<input name="colli" type="number" min={0} defaultValue={d.colli ?? ""} className={inp} /></label>
            <label className="text-xs text-neutral-700">Peso lordo (kg)<input name="pesoLordo" defaultValue={d.pesoLordo ?? ""} className={inp} /></label>
            <label className="text-xs text-neutral-700">Peso netto (kg)<input name="pesoNetto" defaultValue={d.pesoNetto ?? ""} className={inp} /></label>
            <label className="text-xs text-neutral-700">Volume (m³)<input name="volume" defaultValue={d.volume ?? ""} className={inp} /></label>
            <label className="text-xs text-neutral-700">Porto<select name="porto" defaultValue={d.porto ?? ""} className={inp}><option value="">—</option>{PORTO.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="text-xs text-neutral-700">Inizio trasporto<input type="datetime-local" name="inizioTrasporto" defaultValue={d.inizioTrasporto ? perInput(d.inizioTrasporto) : ""} className={inp} /></label>
            <label className="text-xs text-neutral-700">Riferimento<input name="riferimento" defaultValue={d.riferimento ?? ""} className={inp} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-neutral-700 sm:col-span-2">Destinatario<input name="clienteNome" defaultValue={d.clienteNome} className={inp} /></label>
            <label className="text-xs text-neutral-700 sm:col-span-2">Indirizzo<input name="indirizzo" defaultValue={d.indirizzo ?? ""} className={inp} /></label>
            <label className="text-xs text-neutral-700">CAP<input name="cap" defaultValue={d.cap ?? ""} className={inp} /></label>
            <label className="text-xs text-neutral-700">Comune<input name="comune" defaultValue={d.comune ?? ""} className={inp} /></label>
            <label className="text-xs text-neutral-700">Provincia<input name="provincia" defaultValue={d.provincia ?? ""} maxLength={2} className={inp} /></label>
            <span />
            <label className="text-xs text-neutral-700 sm:col-span-4">Luogo di destinazione (se diverso dall&apos;indirizzo: cantiere…)<input name="destinazione" defaultValue={d.destinazione ?? ""} className={inp} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-neutral-700">Note (stampate)<textarea name="note" defaultValue={d.note ?? ""} rows={2} className={inp} /></label>
            <label className="text-xs text-neutral-700">Note sulla consegna<textarea name="noteConsegna" defaultValue={d.noteConsegna ?? ""} rows={2} className={inp} /></label>
            <label className="text-xs text-neutral-700">Note interne<textarea name="noteInterne" defaultValue={d.noteInterne ?? ""} rows={2} className={inp} /></label>
          </div>
          {modificabile && <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Salva i dati</button>}
        </fieldset>
      </form>

      <form action={salvaRigheDdt} id="righe" className="card-fase">
        <input type="hidden" name="id" value={d.id} />
        <h3 className="font-bold text-neutral-900 mb-2">Merce</h3>
        <fieldset disabled={!modificabile} className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200"><th className="w-10">Pos.</th><th className="w-24">Codice</th><th>Descrizione</th><th className="w-20">Q.tà</th><th className="w-20">U.M.</th><th className="w-28">Prezzo €</th><th className="w-16">Sc.%</th><th className="w-36">IVA</th><th className="text-right w-24 pr-2">Importo</th><th className="w-16 pl-2">Stato</th></tr></thead>
              <tbody>
                {d.righe.map((r) => (
                  <tr key={r.id} className={`border-b border-neutral-100 align-top ${r.fatturata ? "bg-green-50/40" : ""}`}>
                    <td className="py-1"><input name={`pos_${r.id}`} defaultValue={r.posizione} disabled={r.fatturata} className={`${inp} px-1`} /></td>
                    <td className="py-1"><input name={`codice_${r.id}`} defaultValue={r.codice ?? ""} disabled={r.fatturata} className={inp} /></td>
                    <td className="py-1"><textarea name={`descrizione_${r.id}`} defaultValue={r.descrizione} disabled={r.fatturata} rows={Math.max(2, Math.min(5, Math.ceil(r.descrizione.length / 38)))} className={inp} /></td>
                    <td className="py-1"><input name={`quantita_${r.id}`} defaultValue={String(r.quantita).replace(".", ",")} disabled={r.fatturata} className={inp} /></td>
                    <td className="py-1"><input name={`um_${r.id}`} defaultValue={r.um ?? ""} list="um" disabled={r.fatturata} className={inp} /></td>
                    <td className="py-1"><input name={`prezzo_${r.id}`} defaultValue={String(r.prezzo).replace(".", ",")} disabled={r.fatturata} className={inp} /></td>
                    <td className="py-1"><input name={`sconto_${r.id}`} defaultValue={r.sconto ? String(r.sconto).replace(".", ",") : ""} disabled={r.fatturata} className={inp} /></td>
                    <td className="py-1"><select name={`iva_${r.id}`} defaultValue={codiceIvaDa(r.aliquota, r.natura).codice} disabled={r.fatturata} className={inp}>{CODICI_IVA.map((c) => <option key={c.codice} value={c.codice}>{c.nome}</option>)}</select></td>
                    <td className="py-1 text-right whitespace-nowrap">{eur(importoRiga(r))}</td>
                    <td className="py-1 pl-2 text-xs">{r.fatturata ? "fatturata" : modificabile ? <label className="flex items-center gap-1"><input type="checkbox" name={`del_${r.id}`} /> togli</label> : ""}</td>
                  </tr>
                ))}
                {modificabile && (
                  <tr className="bg-green-50/50 align-top">
                    <td className="py-1 text-xs text-green-800 font-semibold">+</td>
                    <td className="py-1"><input name="nuova_codice" placeholder="codice" className={inp} /></td>
                    <td className="py-1"><textarea name="nuova_descrizione" rows={1} placeholder="Nuova riga: descrizione della merce…" className={inp} /></td>
                    <td className="py-1"><input name="nuova_quantita" defaultValue="1" className={inp} /></td>
                    <td className="py-1"><input name="nuova_um" list="um" className={inp} /></td>
                    <td className="py-1"><input name="nuova_prezzo" placeholder="0,00" className={inp} /></td>
                    <td className="py-1"><input name="nuova_sconto" className={inp} /></td>
                    <td className="py-1"><select name="nuova_iva" defaultValue={d.righe[0] ? codiceIvaDa(d.righe[0].aliquota, d.righe[0].natura).codice : "22"} className={inp}>{CODICI_IVA.map((c) => <option key={c.codice} value={c.codice}>{c.nome}</option>)}</select></td>
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
            <datalist id="um">{UNITA_MISURA.map((u) => <option key={u} value={u} />)}</datalist>
          </div>
          {modificabile && <button className="btn-3d btn-3d-blue text-sm px-4 py-2 mt-2">Salva la merce</button>}
        </fieldset>
        <p className="text-right text-sm mt-2">Imponibile (non stampato sul DDT): <b>{eur(imponibile)}</b></p>
        <p className="text-[11px] text-neutral-600">I prezzi non compaiono sul DDT: servono per la fattura differita.</p>
      </form>

      {!d.numero && (
        <form action={confermaDdt} className="card-fase border-2 border-green-300">
          <input type="hidden" name="id" value={d.id} />
          <h3 className="font-bold text-neutral-900">Conferma il DDT</h3>
          <p className="text-sm text-neutral-700 my-2">{reale ? "Prende il prossimo numero dei DDT dell'anno e diventa «Da fatturare»." : "Modalità PROVA: prende un numero «PROVA …», non valido per il trasporto."}</p>
          <button className="btn-3d btn-3d-green text-sm px-5 py-2">✓ Conferma e numera</button>
        </form>
      )}
    </div>
  );
}
