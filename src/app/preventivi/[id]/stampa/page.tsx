export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { brandInfo } from "@/lib/brands";
import { unitaMisura, haMisura } from "@/lib/prodotti";
import PrintButton from "@/components/PrintButton";

export default async function StampaPreventivoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const preventivo = await prisma.preventivo.findUnique({
    where: { id },
    include: {
      cliente: true,
      brand: true,
      commerciale: true,
      righe: {
        include: { prodotto: true, optionali: { include: { optional: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!preventivo) notFound();

  const tipologiePresenti = [...new Set(preventivo.righe.map((r) => r.prodotto.tipologia))];
  const modelli = tipologiePresenti.length
    ? await prisma.modelloProdotto.findMany({ where: { brandId: preventivo.brandId, tipologia: { in: tipologiePresenti } } })
    : [];
  const modelloMap = new Map(modelli.map((m) => [m.tipologia, m]));

  const info = brandInfo(preventivo.brand.nome);
  const totaleFinale = preventivo.totaleNetto + preventivo.totaleIva;
  const oggi = new Date().toLocaleDateString("it-IT");
  const numero = preventivo.id.slice(-6).toUpperCase();

  return (
    <div className="max-w-3xl mx-auto bg-white text-neutral-900 p-10 print:p-0">
      <PrintButton />

      <div className="flex items-center justify-between border-b-4 pb-4 mb-6" style={{ borderColor: info.primary }}>
        <div className="flex items-center gap-3">
          <span
            className="w-12 h-12 rounded-md flex items-center justify-center text-white text-lg font-bold"
            style={{ background: info.primary }}
          >
            {preventivo.brand.nome.replace(/[^A-Z&]/g, "").slice(0, 2) || preventivo.brand.nome.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="text-lg font-semibold">{preventivo.brand.nome}</p>
            <p className="text-xs text-neutral-400">Gruppo P&amp;C — [ragione sociale, indirizzo, P.IVA da inserire]</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium">Offerta n° {numero}</p>
          <p className="text-xs text-neutral-400">{oggi}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
        <div>
          <p className="text-xs text-neutral-400 mb-1">Spett.le</p>
          <p className="font-medium">{preventivo.cliente.nome}</p>
          <p className="text-neutral-500">{preventivo.cliente.indirizzo ?? ""}</p>
          <p className="text-neutral-500">{preventivo.cliente.telefono ?? ""} · {preventivo.cliente.email ?? ""}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-400 mb-1">Referente commerciale</p>
          <p className="font-medium">{preventivo.commerciale.nome}</p>
        </div>
      </div>

      <table className="w-full text-sm mb-8">
        <thead>
          <tr className="text-left border-b-2 border-neutral-200 text-xs text-neutral-400">
            <th className="py-2">Descrizione</th>
            <th className="py-2 text-center">Qtà</th>
            <th className="py-2 text-right">Prezzo unit.</th>
            <th className="py-2 text-right">Totale</th>
          </tr>
        </thead>
        <tbody>
          {preventivo.righe.map((r) => {
            const subOptionali = r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
            const subtotale = r.quantita * r.prezzoUnitario + r.optionalPrezzo + subOptionali;
            const modello = modelloMap.get(r.prodotto.tipologia);
            const descrizioneEffettiva = r.descrizionePersonalizzata ?? modello?.descrizioneTecnica ?? "";
            const mostraScheda = r.mostraDescrizione && modello && (modello.immagineUrl || descrizioneEffettiva);
            const unit = unitaMisura(r.prodotto.tipologia);
            const larghezzaMostrata = r.misuraLarghezza ?? r.prodotto.larghezzaMm;
            const altezzaMostrata = r.misuraAltezza ?? r.prodotto.altezzaMm;
            return (
              <tr key={r.id} className="border-b border-neutral-100 align-top">
                <td className="py-2">
                  <div className="flex items-start gap-2">
                    {mostraScheda && modello?.immagineUrl && (
                      <img src={modello.immagineUrl} alt={r.prodotto.tipologia} className="w-16 h-16 object-cover rounded shrink-0" />
                    )}
                    <div>
                      <p className="font-medium">{r.prodotto.tipologia.replace(/_/g, " ")}</p>
                      <p className="text-xs text-neutral-400">
                        colore {r.prodotto.colore}
                        {haMisura(r.prodotto.larghezzaMm, r.prodotto.altezzaMm) && ` · ${larghezzaMostrata}×${altezzaMostrata}${unit}`}
                      </p>
                      {mostraScheda && descrizioneEffettiva && (
                        <p className="text-xs text-neutral-500 mt-1 max-w-md whitespace-pre-line">{descrizioneEffettiva}</p>
                      )}
                      {r.optionali.map((ro) => (
                        <p key={ro.id} className="text-xs text-neutral-400">+ {ro.optional.nome} ({ro.quantita}×)</p>
                      ))}
                    </div>
                  </div>
                </td>
                <td className="py-2 text-center">{r.quantita}</td>
                <td className="py-2 text-right">{r.prezzoUnitario.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</td>
                <td className="py-2 text-right font-medium">{subtotale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex justify-end mb-10">
        <div className="w-64 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-neutral-500">Imponibile</span>
            <span>{preventivo.totaleNetto.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-neutral-500">IVA ({preventivo.aliquotaIva}%)</span>
            <span>{preventivo.totaleIva.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
          </div>
          <div className="flex justify-between py-2 border-t-2 mt-1 font-semibold" style={{ borderColor: info.primary }}>
            <span>Totale offerta</span>
            <span>{totaleFinale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-neutral-300 border-t border-neutral-100 pt-4">
        Offerta valida 30 giorni dalla data di emissione salvo diversa indicazione. Prezzi espressi in Euro.
        {preventivo.brand.nome} — Gruppo P&amp;C — documento generato dal CRM interno.
      </p>
    </div>
  );
}
