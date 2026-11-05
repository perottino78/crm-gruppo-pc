export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { residuoScadenza } from "@/lib/amministrazione/server";
import { oggiUtc } from "@/lib/amministrazione/filtri";
import { eur, dataIt } from "@/lib/amministrazione/costanti";
import { STATI_VENDITA, statoVendita } from "@/lib/fatture/vendite";
import { TIPI_DOCUMENTO } from "@/lib/fatture/fatturapa";
import { ritenutaPrevista } from "@/lib/amministrazione/pagamenti";
import { numeroCommessa } from "@/lib/commesse";
import { BRANDS } from "@/lib/brands";
import { salvaFatturaVendita, eliminaFatturaVendita } from "@/app/vendite-actions";
import RegistraPagamento from "@/components/amministrazione/RegistraPagamento";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm w-full";

export default async function FatturaVenditaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; errore?: string }> }) {
  const { id } = await params;
  const msg = await searchParams;
  const f = await prisma.fatturaVendita.findUnique({ where: { id } });
  if (!f) notFound();
  const [scadenze, conti, commesse, clienti, commessa, cliente] = await Promise.all([
    prisma.scadenza.findMany({ where: { fatturaVenditaId: f.id }, orderBy: [{ dataScadenza: "asc" }, { createdAt: "asc" }], include: { abbinamenti: { include: { movimento: { select: { id: true, data: true, metodo: true, origine: true, confermatoIl: true, daConfermare: true, conto: { select: { nome: true } } } } } } } }),
    prisma.contoFinanziario.findMany({ where: { attivo: true }, select: { id: true, nome: true, tipo: true }, orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.commessa.findMany({ where: { stato: { notIn: ["ANNULLATA"] } }, select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } }, orderBy: [{ anno: "desc" }, { numero: "desc" }], take: 1500 }),
    prisma.cliente.findMany({ where: { OR: [{ commesse: { some: {} } }, { categoria: { contains: "Cliente", mode: "insensitive" } }] }, select: { nome: true }, orderBy: { nome: "asc" }, take: 5000 }),
    f.commessaId ? prisma.commessa.findUnique({ where: { id: f.commessaId }, select: { id: true, numero: true, anno: true, cliente: { select: { nome: true } } } }) : Promise.resolve(null),
    f.clienteId ? prisma.cliente.findUnique({ where: { id: f.clienteId }, select: { id: true, nome: true } }) : Promise.resolve(null),
  ]);
  const righe = scadenze.map((s) => ({ ...s, residuo: s.stato === "ANNULLATA" ? 0 : residuoScadenza(s) }));
  const stato = STATI_VENDITA[statoVendita(f, righe, oggiUtc())];
  const incassato = righe.reduce((t, s) => t + s.importo - s.residuo, 0);
  const pagamenti = righe.some((s) => s.abbinamenti.length || s.pagatoManuale > 0 || s.ritenuta > 0);

  return (
    <div className="space-y-4">
      {msg.ok && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {msg.ok}</p>}
      {msg.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{msg.errore}</p>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/amministrazione/fatture-vendita" className="btn-indietro">← Fatture di vendita</Link>
          <h2 className="text-xl font-bold text-neutral-900">{TIPI_DOCUMENTO[f.tipoDocumento] ?? "Fattura"} {f.numero} del {dataIt(f.data)}</h2>
          <p className="text-sm text-neutral-700">
            <b>{f.clienteNome}</b>{f.partitaIva ? ` · P.IVA ${f.partitaIva}` : f.codiceFiscale ? ` · CF ${f.codiceFiscale}` : ""} · {f.divisione ?? "P&C"}{f.brand && f.brand !== (f.divisione ?? "P&C") ? ` · ${f.brand}` : ""} · {f.origine === "XML" ? "da XML" : f.origine === "BCONSOLE" ? "importata da BConsole" : "inserita a mano"}
          </p>
          <p className="text-xs text-neutral-600">
            {cliente ? <Link href={`/clienti/${cliente.id}`} className="underline">Scheda cliente</Link> : <span className="text-amber-800">Cliente non collegato al CRM: sceglilo qui sotto.</span>}
            {commessa && <> · <Link href={`/commesse/${commessa.id}`} className="underline">commessa {numeroCommessa(commessa)}</Link></>}
          </p>
          {f.causale && <p className="text-xs text-neutral-500 mt-1">Causale: {f.causale}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{eur(f.totale)}</p>
          <p className="text-xs text-neutral-600">imponibile {eur(f.imponibile)} · IVA {eur(f.iva)}</p>
          <p className="text-xs text-neutral-600">incassato {eur(incassato)}</p>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${stato.cls}`}>{stato.nome}</span>
        </div>
      </div>

      <section className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
        <h3 className="font-bold">Incassi</h3>
        {f.detrazione && <p className="text-xs text-purple-900 bg-purple-50 border border-purple-200 rounded px-2 py-1">Lavoro con detrazione: se il cliente paga con bonifico &quot;parlante&quot;, la banca accredita il totale meno l&apos;11% dell&apos;imponibile. Registra l&apos;importo accreditato e la ritenuta: la scadenza risulta saldata.</p>}
        {righe.length === 0 && <p className="text-sm text-neutral-600">{f.totale < 0 ? "Nota di credito: nessun incasso." : "Nessuna scadenza di incasso."}</p>}
        {righe.map((s) => (
          <div key={s.id} className="border-t border-neutral-100 pt-2 first:border-0 first:pt-0">
            <p className="text-sm">{dataIt(s.dataScadenza)} · {eur(s.importo)} · {s.descrizione} <span className="text-xs text-neutral-600">({s.stato === "PAGATA" ? "incassata" : s.stato === "PARZIALE" ? "incassata in parte" : s.stato === "ANNULLATA" ? "annullata" : "da incassare"})</span>
              {s.origine !== "FATTURA_VENDITA" && <span className="text-xs text-neutral-500"> · incasso della commessa</span>}</p>
            {s.stato !== "ANNULLATA" && <RegistraPagamento conti={conti} ritorno={`/amministrazione/fatture-vendita/${f.id}`}
              ritenutaSuggerita={f.detrazione && s.ritenuta === 0 ? ritenutaPrevista(f, s.importo) : 0}
              scadenza={{ id: s.id, tipo: s.tipo, residuo: s.residuo, ritenuta: s.ritenuta, pagamenti: s.abbinamenti.map((a) => ({ abbinamentoId: a.id, importo: a.importo, movimento: a.movimento })) }} />}
          </div>
        ))}
      </section>

      <form action={salvaFatturaVendita} className="bg-white border border-neutral-200 rounded-lg p-4 grid md:grid-cols-4 gap-2 items-end">
        <input type="hidden" name="id" value={f.id} />
        <h3 className="font-bold md:col-span-4">Collegamenti</h3>
        <label className="text-xs font-semibold md:col-span-2">Commessa (scrivi il nome del cliente o il numero)
          <input name="commessa" list="fvd-commesse" defaultValue={commessa ? `${numeroCommessa(commessa)} · ${commessa.cliente.nome}` : ""} placeholder="es. Rossi… oppure C2026-012" className={inp} />
        </label>
        <label className="text-xs font-semibold md:col-span-2">Cliente
          <input name="cliente" list="fvd-clienti" defaultValue={cliente?.nome ?? ""} placeholder={f.clienteNome} className={inp} />
        </label>
        <datalist id="fvd-commesse">{commesse.map((c) => <option key={c.id} value={`${numeroCommessa(c)} · ${c.cliente.nome}`} />)}</datalist>
        <datalist id="fvd-clienti">{clienti.map((c, i) => <option key={i} value={c.nome} />)}</datalist>
        <label className="text-xs font-semibold">Marchio / centro di ricavo<select name="brand" defaultValue={f.brand ?? ""} className={inp}><option value="">—</option>{BRANDS.map((b) => <option key={b.nome}>{b.nome}</option>)}</select></label>
        <label className="text-xs font-semibold">Sezionale<input name="sezionale" defaultValue={f.sezionale ?? ""} placeholder="es. Fatture P&C" className={inp} /></label>
        <label className="text-xs font-semibold flex items-center gap-2 md:col-span-2"><input type="checkbox" name="detrazione" defaultChecked={f.detrazione} /> Lavoro con detrazione (ritenuta 11% sul bonifico)</label>
        <label className="text-xs font-semibold md:col-span-3">Note<input name="note" defaultValue={f.note ?? ""} className={inp} /></label>
        <button className="btn-3d btn-3d-blue text-sm px-3 py-2">Salva</button>
        <p className="text-[11px] text-neutral-500 md:col-span-4">Collegando la commessa, se la fattura non ha ancora incassi, le scadenze si agganciano all&apos;acconto o al saldo della commessa con lo stesso importo.</p>
      </form>

      {!pagamenti && (
        <form action={eliminaFatturaVendita} className="text-right"><input type="hidden" name="id" value={f.id} /><button className="text-xs text-red-700 underline">elimina (caricata per errore)</button></form>
      )}
    </div>
  );
}
