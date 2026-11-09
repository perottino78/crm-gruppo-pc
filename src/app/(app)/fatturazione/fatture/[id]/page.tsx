export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { numeroCommessa } from "@/lib/commesse";
import { perInput } from "@/lib/calendario/tempo";
import { ASPETTO_BENI, BANCHE_AZIENDA, CAUSALI_TRASPORTO, CODICI_IVA, METODI_PAGAMENTO_FATTURA, PORTO, SEZIONALI, STATI_FATTURA, TIPI_FATTURA, TRASPORTO_A_CURA, UNITA_MISURA, codiceIvaDa, tipoFattura } from "@/lib/fatturazione/tabelle";
import { importoRiga, rateDaMetodo, serveBollo, totali } from "@/lib/fatturazione/calcoli";
import { controlliEmissione, emissioneReale } from "@/lib/fatturazione/server";
import { salvaTestataFattura, salvaRigheFattura, emettiFattura, eliminaFattura, creaNotaCredito, duplicaFattura } from "@/app/fatturazione-actions";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm w-full disabled:bg-neutral-50 disabled:text-neutral-700";
const giornoInput = (d: Date) => d.toISOString().slice(0, 10);

export default async function FatturaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ errore?: string; salvato?: string; emessa?: string }> }) {
  const { id } = await params;
  const msg = await searchParams;
  const f = await prisma.fatturaEmessa.findUnique({ where: { id }, include: { righe: { orderBy: [{ posizione: "asc" }, { id: "asc" }] }, ddt: { orderBy: { numero: "asc" } } } });
  if (!f) notFound();
  const [commessa, collegata, note, reale] = await Promise.all([
    f.commessaId ? prisma.commessa.findUnique({ where: { id: f.commessaId }, select: { id: true, numero: true, anno: true } }) : null,
    f.fatturaCollegataId ? prisma.fatturaEmessa.findUnique({ where: { id: f.fatturaCollegataId }, select: { id: true, numero: true, data: true } }) : null,
    prisma.fatturaEmessa.findMany({ where: { fatturaCollegataId: f.id }, select: { id: true, numero: true, stato: true } }),
    emissioneReale(),
  ]);
  const tf = tipoFattura(f.tipo);
  const bozza = f.stato === "BOZZA";
  const bollo = serveBollo(f.righe);
  const t = totali(f.righe, { bollo, addebitoBollo: bollo && f.addebitoBollo });
  const mancano = controlliEmissione(f, f.righe);
  const rate = Array.isArray(f.rate) && f.rate.length ? (f.rate as { data: string; importo: number }[]).map((r) => ({ data: new Date(r.data), importo: r.importo })) : rateDaMetodo(f.metodoPagamento, f.data, t.totale);
  const stato = STATI_FATTURA[f.stato];

  return (
    <div className="space-y-4">
      {msg.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">⚠️ {msg.errore}</p>}
      {msg.salvato && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✓ Salvato</p>}
      {msg.emessa && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✓ {f.stato === "PROVA" ? "Fattura di prova emessa (numero «PROVA», non valida)" : "Fattura emessa"}: n. {f.numero}. Scarica il PDF per il cliente{f.xml ? " e l'XML da caricare" : ""}.</p>}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/fatturazione/fatture" className="btn-indietro">← Fatture</Link>
          <h2 className="text-xl font-bold text-neutral-900">{tf.nome} {f.numero ? `n. ${f.numero}` : "(bozza)"} del {dataIt(f.data)}</h2>
          <p className="text-sm text-neutral-700">
            <b>{f.clienteNome}</b> · <span className="font-semibold" style={{ color: stato?.colore }}>{stato?.nome}</span>
            {commessa && <> · <Link href={`/commesse/${commessa.id}`} className="underline">commessa {numeroCommessa(commessa)}</Link></>}
            {f.clienteId && <> · <Link href={`/clienti/${f.clienteId}`} className="underline">scheda cliente</Link></>}
            {collegata && <> · storna <Link href={`/fatturazione/fatture/${collegata.id}`} className="underline">{collegata.numero ?? "bozza"}</Link></>}
            {f.fatturaVenditaId && <> · <Link href={`/amministrazione/fatture-vendita/${f.fatturaVenditaId}`} className="underline">incassi e scadenze</Link></>}
          </p>
          {f.emessaIl && <p className="text-xs text-neutral-600">Emessa da {f.emessaDaNome} il {dataIt(f.emessaIl)}</p>}
          {note.length > 0 && <p className="text-xs text-neutral-600">Note di credito: {note.map((n) => <Link key={n.id} href={`/fatturazione/fatture/${n.id}`} className="underline mr-2">{n.numero ?? "bozza"}</Link>)}</p>}
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          <a href={`/api/fatturazione/fattura/${f.id}/pdf`} target="_blank" rel="noreferrer" className="btn-3d btn-3d-outline text-sm px-3 py-1.5">📄 {bozza ? "Anteprima PDF" : "PDF di cortesia"}</a>
          {f.xml && <a href={`/api/fatturazione/fattura/${f.id}/xml`} className="btn-3d btn-3d-outline text-sm px-3 py-1.5">⬇️ XML fattura elettronica</a>}
          {!bozza && <form action={duplicaFattura}><input type="hidden" name="id" value={f.id} /><button className="btn-3d btn-3d-outline text-sm px-3 py-1.5">⧉ Duplica</button></form>}
          {(f.stato === "EMESSA" || f.stato === "PROVA") && tf.fiscale && !tf.notaCredito && <form action={creaNotaCredito}><input type="hidden" name="id" value={f.id} /><button className="btn-3d btn-3d-amber text-sm px-3 py-1.5">↩︎ Nota di credito</button></form>}
          {f.stato !== "EMESSA" && <form action={eliminaFattura}><input type="hidden" name="id" value={f.id} /><button className="btn-3d btn-3d-red text-sm px-3 py-1.5">Elimina</button></form>}
        </div>
      </div>

      {/* Testata */}
      <form action={salvaTestataFattura} className="card-fase">
        <input type="hidden" name="id" value={f.id} />
        <fieldset disabled={!bozza} className="space-y-3 min-w-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-neutral-700">Tipo<select name="tipo" defaultValue={f.tipo} className={inp}>{TIPI_FATTURA.map((x) => <option key={x.codice} value={x.codice}>{x.nome}</option>)}</select></label>
            <label className="text-xs text-neutral-700">Sezionale<select name="sezionale" defaultValue={f.sezionale} className={inp}>{SEZIONALI.map((s) => <option key={s.codice} value={s.codice}>{s.nome} (…/{s.estensione})</option>)}</select></label>
            <label className="text-xs text-neutral-700">Data<input type="date" name="data" defaultValue={giornoInput(f.data)} className={inp} /></label>
            <label className="text-xs text-neutral-700">Riferimento<input name="riferimento" defaultValue={f.riferimento ?? ""} className={inp} /></label>
          </div>
          <details open={bozza && mancano.some((m) => /cliente|indirizzo|fiscale|IVA/.test(m))}>
            <summary className="cursor-pointer text-sm font-semibold text-neutral-800">Dati del cliente in fattura {mancano.some((m) => /cliente|indirizzo|fiscale|IVA/.test(m)) && <span className="text-red-700">— da completare</span>}</summary>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-2">
              <label className="text-xs text-neutral-700 sm:col-span-2">Intestazione<input name="clienteNome" defaultValue={f.clienteNome} className={inp} /></label>
              <label className="text-xs text-neutral-700 flex items-center gap-2 mt-5"><input type="checkbox" name="persona" defaultChecked={f.persona} /> Persona fisica (privato)</label>
              <span />
              <label className="text-xs text-neutral-700">Nome (privato)<input name="nomePersona" defaultValue={f.nomePersona ?? ""} className={inp} /></label>
              <label className="text-xs text-neutral-700">Cognome (privato)<input name="cognome" defaultValue={f.cognome ?? ""} className={inp} /></label>
              <label className="text-xs text-neutral-700">Codice fiscale<input name="codiceFiscale" defaultValue={f.codiceFiscale ?? ""} className={inp} /></label>
              <label className="text-xs text-neutral-700">Partita IVA<input name="partitaIva" defaultValue={f.partitaIva ?? ""} className={inp} /></label>
              <label className="text-xs text-neutral-700 sm:col-span-2">Indirizzo<input name="indirizzo" defaultValue={f.indirizzo ?? ""} className={inp} /></label>
              <label className="text-xs text-neutral-700">CAP<input name="cap" defaultValue={f.cap ?? ""} className={inp} /></label>
              <label className="text-xs text-neutral-700">Comune<input name="comune" defaultValue={f.comune ?? ""} className={inp} /></label>
              <label className="text-xs text-neutral-700">Provincia (sigla)<input name="provincia" defaultValue={f.provincia ?? ""} maxLength={2} className={inp} /></label>
              <label className="text-xs text-neutral-700">Nazione<input name="nazione" defaultValue={f.nazione} maxLength={2} className={inp} /></label>
              <label className="text-xs text-neutral-700">Codice destinatario SDI<input name="codiceDestinatario" defaultValue={f.codiceDestinatario ?? ""} maxLength={7} placeholder="0000000 per i privati" className={inp} /></label>
              <label className="text-xs text-neutral-700">PEC<input name="pec" defaultValue={f.pec ?? ""} className={inp} /></label>
            </div>
          </details>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-neutral-700">Pagamento<select name="metodoPagamento" defaultValue={f.metodoPagamento ?? "BONIFICO_VISTA"} className={inp}>{METODI_PAGAMENTO_FATTURA.map((m) => <option key={m.codice} value={m.codice}>{m.nome}</option>)}</select></label>
            <label className="text-xs text-neutral-700">Banca per l&apos;incasso<select name="banca" defaultValue={f.banca ?? ""} className={inp}><option value="">—</option>{BANCHE_AZIENDA.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
            <label className="text-xs text-neutral-700 sm:col-span-2">IBAN (vuoto = quello del conto in Amministrazione › Banche)<input name="iban" defaultValue={f.iban ?? ""} className={inp} /></label>
          </div>
          <label className="block text-xs text-neutral-700">Causale (va nella fattura elettronica)<input name="causale" defaultValue={f.causale ?? ""} className={inp} /></label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="detrazione" defaultChecked={f.detrazione} /> Lavori con detrazione fiscale (bonifico parlante)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="addebitoBollo" defaultChecked={f.addebitoBollo} /> Addebita il bollo da 2 € al cliente (se dovuto)</label>
          </div>
          {tf.trasporto && (
            <div className="rounded border border-neutral-200 p-3 space-y-2">
              <p className="text-sm font-semibold">Dati di trasporto (fattura accompagnatoria)</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs text-neutral-700">Causale trasporto<select name="causaleTrasporto" defaultValue={f.causaleTrasporto ?? CAUSALI_TRASPORTO[0]} className={inp}>{CAUSALI_TRASPORTO.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="text-xs text-neutral-700">Trasporto a cura<select name="trasportoACura" defaultValue={f.trasportoACura ?? "MITTENTE"} className={inp}>{TRASPORTO_A_CURA.map((c) => <option key={c.codice} value={c.codice}>{c.nome}</option>)}</select></label>
                <label className="text-xs text-neutral-700">Vettore<input name="vettore" defaultValue={f.vettore ?? ""} className={inp} /></label>
                <label className="text-xs text-neutral-700">Porto<select name="porto" defaultValue={f.porto ?? ""} className={inp}><option value="">—</option>{PORTO.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="text-xs text-neutral-700">Aspetto dei beni<select name="aspettoBeni" defaultValue={f.aspettoBeni ?? ""} className={inp}><option value="">—</option>{ASPETTO_BENI.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="text-xs text-neutral-700">N. colli<input name="colli" type="number" min={0} defaultValue={f.colli ?? ""} className={inp} /></label>
                <label className="text-xs text-neutral-700">Peso lordo (kg)<input name="pesoLordo" defaultValue={f.pesoLordo ?? ""} className={inp} /></label>
                <label className="text-xs text-neutral-700">Inizio trasporto<input type="datetime-local" name="inizioTrasporto" defaultValue={f.inizioTrasporto ? perInput(f.inizioTrasporto) : ""} className={inp} /></label>
                <label className="text-xs text-neutral-700 sm:col-span-4">Luogo di destinazione (se diverso)<input name="destinazione" defaultValue={f.destinazione ?? ""} className={inp} /></label>
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-neutral-700">Note in fattura<textarea name="note" defaultValue={f.note ?? ""} rows={2} className={inp} /></label>
            <label className="text-xs text-neutral-700">Note interne (non stampate)<textarea name="noteInterne" defaultValue={f.noteInterne ?? ""} rows={2} className={inp} /></label>
          </div>
          {bozza && <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Salva i dati</button>}
        </fieldset>
      </form>

      {/* Righe */}
      <form action={salvaRigheFattura} id="righe" className="card-fase">
        <input type="hidden" name="id" value={f.id} />
        <h3 className="font-bold text-neutral-900 mb-2">Righe</h3>
        <fieldset disabled={!bozza} className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200"><th className="w-10">Pos.</th><th className="w-24">Codice</th><th>Descrizione</th><th className="w-20">Q.tà</th><th className="w-20">U.M.</th><th className="w-28">Prezzo €</th><th className="w-16">Sc.%</th><th className="w-36">IVA</th><th className="text-right w-28 pr-2">Importo</th>{bozza && <th className="w-12 pl-2">Togli</th>}</tr></thead>
              <tbody>
                {f.righe.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100 align-top">
                    <td className="py-1"><input name={`pos_${r.id}`} defaultValue={r.posizione} className={`${inp} px-1`} /></td>
                    <td className="py-1"><input name={`codice_${r.id}`} defaultValue={r.codice ?? ""} className={inp} /></td>
                    <td className="py-1"><textarea name={`descrizione_${r.id}`} defaultValue={r.descrizione} rows={Math.max(2, Math.min(5, Math.ceil(r.descrizione.length / 38)))} className={inp} /></td>
                    <td className="py-1"><input name={`quantita_${r.id}`} defaultValue={String(r.quantita).replace(".", ",")} className={inp} /></td>
                    <td className="py-1"><input name={`um_${r.id}`} defaultValue={r.um ?? ""} list="um" className={inp} /></td>
                    <td className="py-1"><input name={`prezzo_${r.id}`} defaultValue={String(r.prezzo).replace(".", ",")} className={inp} /></td>
                    <td className="py-1"><input name={`sconto_${r.id}`} defaultValue={r.sconto ? String(r.sconto).replace(".", ",") : ""} className={inp} /></td>
                    <td className="py-1"><select name={`iva_${r.id}`} defaultValue={codiceIvaDa(r.aliquota, r.natura).codice} className={inp}>{CODICI_IVA.map((c) => <option key={c.codice} value={c.codice}>{c.nome}</option>)}</select></td>
                    <td className="py-1 text-right whitespace-nowrap">{eur(importoRiga(r))}</td>
                    {bozza && <td className="py-1 text-center"><input type="checkbox" name={`del_${r.id}`} aria-label="Togli la riga" /></td>}
                  </tr>
                ))}
                {bozza && (
                  <tr className="bg-green-50/50 align-top">
                    <td className="py-1 text-xs text-green-800 font-semibold">+</td>
                    <td className="py-1"><input name="nuova_codice" placeholder="codice" className={inp} /></td>
                    <td className="py-1"><textarea name="nuova_descrizione" rows={1} placeholder="Nuova riga: descrizione…" className={inp} /></td>
                    <td className="py-1"><input name="nuova_quantita" defaultValue="1" className={inp} /></td>
                    <td className="py-1"><input name="nuova_um" list="um" className={inp} /></td>
                    <td className="py-1"><input name="nuova_prezzo" placeholder="0,00" className={inp} /></td>
                    <td className="py-1"><input name="nuova_sconto" className={inp} /></td>
                    <td className="py-1"><select name="nuova_iva" defaultValue={f.righe[0] ? codiceIvaDa(f.righe[0].aliquota, f.righe[0].natura).codice : "22"} className={inp}>{CODICI_IVA.map((c) => <option key={c.codice} value={c.codice}>{c.nome}</option>)}</select></td>
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
            <datalist id="um">{UNITA_MISURA.map((u) => <option key={u} value={u} />)}</datalist>
          </div>
          {bozza && <button className="btn-3d btn-3d-blue text-sm px-4 py-2 mt-2">Salva le righe</button>}
          {bozza && <p className="text-[11px] text-neutral-600 mt-1">Prezzo 0 = riga di sola descrizione. Prezzo negativo = detrazione (es. acconto già fatturato). Prezzi IVA esclusa.</p>}
        </fieldset>
        <div className="mt-3 flex flex-wrap justify-between gap-4 text-sm">
          <table className="text-xs">
            <tbody>{t.riepilogo.map((v) => <tr key={`${v.aliquota}${v.natura}`}><td className="pr-3">{v.natura ? `${v.natura} — ${codiceIvaDa(0, v.natura).nome}` : `IVA ${v.aliquota}%`}</td><td className="pr-3 text-right">{eur(v.imponibile)}</td><td className="text-right">{eur(v.imposta)}</td></tr>)}</tbody>
          </table>
          <div className="text-right space-y-0.5">
            <p>Imponibile <b>{eur(t.imponibile)}</b></p>
            <p>IVA <b>{eur(t.iva)}</b></p>
            {bollo && <p>Bollo {f.addebitoBollo ? "addebitato" : "virtuale (a carico nostro)"} <b>{eur(t.bollo)}</b></p>}
            <p className="text-lg">Totale <b>{eur(t.totale)}</b></p>
            {rate.length > 0 && !tf.notaCredito && <p className="text-xs text-neutral-600">Scadenze: {rate.map((r) => `${dataIt(r.data)} ${eur(r.importo)}`).join(" · ")}</p>}
          </div>
        </div>
      </form>

      {f.ddt.length > 0 && (
        <div className="card-fase text-sm">
          <b>DDT fatturati in questa fattura:</b> {f.ddt.map((d) => <Link key={d.id} href={`/fatturazione/ddt/${d.id}`} className="underline mr-3">{d.prova ? "PROVA " : ""}{d.numero}/{d.anno} del {dataIt(d.data)}</Link>)}
        </div>
      )}

      {bozza && (
        <form action={emettiFattura} className="card-fase border-2 border-green-300">
          <input type="hidden" name="id" value={f.id} />
          <h3 className="font-bold text-neutral-900">Emetti la fattura</h3>
          {mancano.length > 0
            ? <ul className="text-sm text-red-800 list-disc ml-5 my-2">{mancano.map((m) => <li key={m}>{m}</li>)}</ul>
            : <p className="text-sm text-neutral-700 my-2">
                {!tf.fiscale ? "La proforma prende un suo numero (non fiscale)." : reale
                  ? "Prende il prossimo numero del sezionale, va nelle fatture di vendita e nello scadenzario. Dopo non si modifica più (si corregge con una nota di credito)."
                  : "Siamo in modalità PROVA: prende un numero «PROVA …», non va nelle vendite né nello scadenzario. Serve per collaudare PDF e XML."}
              </p>}
          <button disabled={mancano.length > 0} className="btn-3d btn-3d-green text-sm px-5 py-2 disabled:opacity-50">✓ Emetti {reale || !tf.fiscale ? "" : "(prova)"}</button>
        </form>
      )}
      {f.stato !== "BOZZA" && tf.fiscale && (
        <p className="text-xs text-neutral-600">Fino al collegamento con lo SDI (gennaio 2027) l&apos;XML va caricato a mano sul portale «Fatture e Corrispettivi» o dall&apos;intermediario; il PDF è la copia di cortesia per il cliente.</p>
      )}
    </div>
  );
}
