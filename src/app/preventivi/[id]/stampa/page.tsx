export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { brandInfo } from "@/lib/brands";
import { unitaMisura, haMisura } from "@/lib/prodotti";
import PrintButton from "@/components/PrintButton";
import {
  ARTICOLI_CONTRATTO,
  ARTICOLI_VESSATORI,
  INTRO_CONTRATTO,
  DICHIARAZIONE_VESSATORIE,
  GDPR_INFORMATIVA,
  GDPR_CONSENSO,
  CONSENSO_MARKETING,
  CONSENSO_FOTO,
} from "@/lib/condizioniGeneraliPC";

function RigaFirma({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="w-56">
      <div className="border-t border-neutral-400 pt-1">
        <p className="text-[10px] text-neutral-500">{label}</p>
        {sub && <p className="text-[9px] text-neutral-400">{sub}</p>}
      </div>
    </div>
  );
}

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
  const isPC = preventivo.brand.nome === "P&C";

  const imponibileLordo = preventivo.righe.reduce((sum, r) => {
    const subOptionali = r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
    return sum + r.quantita * r.prezzoUnitario + r.optionalPrezzo + subOptionali;
  }, 0);
  const sconto = preventivo.scontoPercentuale ?? 0;
  const totaleNetto = preventivo.totaleNetto;
  const totaleIva = preventivo.totaleIva;
  const totaleFinale = totaleNetto + totaleIva;

  const oggi = new Date().toLocaleDateString("it-IT");
  const anno = preventivo.createdAt.getFullYear();
  const numero = `${preventivo.id.slice(-6).toUpperCase()}/${anno}`;

  const eur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

  return (
    <div className="max-w-3xl mx-auto bg-white text-neutral-900 print:max-w-none">
      <PrintButton />

      {/* ===== PAGINA 1 — COPERTINA / OFFERTA ===== */}
      <section className="p-10 print:p-8 print:break-after-page">
        <div className="flex items-center justify-between border-b-4 pb-4 mb-6" style={{ borderColor: info.primary }}>
          <div className="flex items-center gap-3">
            {isPC ? (
              <img src="/immagini/brand/pc_logo.png" alt="P&C Gruppo" className="h-14 w-auto object-contain" />
            ) : (
              <span
                className="w-12 h-12 rounded-md flex items-center justify-center text-white text-lg font-bold"
                style={{ background: info.primary }}
              >
                {preventivo.brand.nome.replace(/[^A-Z&]/g, "").slice(0, 2) || preventivo.brand.nome.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-lg font-semibold">{preventivo.brand.nome}</p>
              {isPC ? (
                <p className="text-xs text-neutral-400">P&amp;C S.r.l. Unipersonale — Corso Moncenisio, 28 — 10090 Rosta (TO) — P.IVA 10741080013 — Tel. 011 19887497</p>
              ) : (
                <p className="text-xs text-neutral-400">Gruppo P&amp;C</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">Offerta n° {numero}</p>
            <p className="text-xs text-neutral-400">{oggi}</p>
          </div>
        </div>

        {preventivo.oggetto && (
          <p className="text-base font-semibold mb-4" style={{ color: info.primary }}>{preventivo.oggetto}</p>
        )}

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
                  <td className="py-2 text-right">{eur(r.prezzoUnitario)}</td>
                  <td className="py-2 text-right font-medium">{eur(subtotale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex justify-end mb-8">
          <div className="w-64 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-neutral-500">Imponibile</span>
              <span>{eur(imponibileLordo)}</span>
            </div>
            {sconto > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-neutral-500">Sconto ({sconto}%)</span>
                <span>-{eur(imponibileLordo - totaleNetto)}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-neutral-500">Imponibile {sconto > 0 ? "scontato" : ""}</span>
              <span>{eur(totaleNetto)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-neutral-500">IVA ({preventivo.aliquotaIva}%)</span>
              <span>{eur(totaleIva)}</span>
            </div>
            <div className="flex justify-between py-2 border-t-2 mt-1 font-semibold" style={{ borderColor: info.primary }}>
              <span>Totale a pagare</span>
              <span>{eur(totaleFinale)}</span>
            </div>
          </div>
        </div>

        {(preventivo.condizioniPagamento || preventivo.condizioniConsegna) && (
          <div className="grid grid-cols-2 gap-6 mb-8 text-xs">
            <div>
              <p className="text-neutral-400 mb-1">Condizioni di pagamento</p>
              <p className="text-neutral-600 whitespace-pre-line">{preventivo.condizioniPagamento ?? "Da definire."}</p>
            </div>
            <div>
              <p className="text-neutral-400 mb-1">Condizioni di consegna</p>
              <p className="text-neutral-600 whitespace-pre-line">{preventivo.condizioniConsegna ?? "Da definire."}</p>
            </div>
          </div>
        )}

        {isPC ? (
          <p className="text-[10px] text-neutral-400 mb-6">
            L'Acquirente dichiara di aver ricevuto, letto e accettato, sottoscrivendo la presente offerta, le
            "Condizioni Generali di Vendita P&amp;C" riportate nelle pagine seguenti, che formano parte integrante
            e sostanziale del presente Contratto.
          </p>
        ) : (
          <p className="text-xs text-neutral-300 border-t border-neutral-100 pt-4 mb-6">
            Offerta valida 30 giorni dalla data di emissione salvo diversa indicazione. Prezzi espressi in Euro.
            {" "}{preventivo.brand.nome} — Gruppo P&amp;C — documento generato dal CRM interno.
          </p>
        )}

        <div className="flex justify-between mt-10">
          <RigaFirma label="Luogo e data" />
          <RigaFirma label="Il Cliente (per accettazione)" sub={preventivo.cliente.nome} />
          <RigaFirma label="Il Fornitore" sub={isPC ? "P&C S.r.l. Unipersonale" : preventivo.brand.nome} />
        </div>
      </section>

      {isPC && (
        <>
          {/* ===== CONDIZIONI GENERALI DI VENDITA — ARTICOLI ===== */}
          <section className="p-10 print:p-8 print:break-after-page text-[9.5px] leading-snug">
            <h2 className="text-sm font-bold mb-1" style={{ color: info.primary }}>CONDIZIONI GENERALI DI VENDITA P&amp;C</h2>
            <p className="text-[9px] text-neutral-500 mb-4">{INTRO_CONTRATTO}</p>
            {ARTICOLI_CONTRATTO.map((a) => (
              <div key={a.numero} className="mb-2.5 print:break-inside-avoid">
                <p className="font-semibold">Art. {a.numero} — {a.titolo}</p>
                <p className="text-justify text-neutral-700">{a.testo}</p>
              </div>
            ))}
          </section>

          {/* ===== ACCETTAZIONE CLAUSOLE VESSATORIE (art. 1341-1342 c.c.) ===== */}
          <section className="p-10 print:p-8 print:break-after-page text-xs">
            <h2 className="text-sm font-bold mb-3" style={{ color: info.primary }}>
              Approvazione specifica delle clausole ai sensi degli artt. 1341 e 1342 c.c.
            </h2>
            <p className="text-neutral-700 mb-2">{DICHIARAZIONE_VESSATORIE}</p>
            <p className="font-medium mb-6">
              Artt. {ARTICOLI_VESSATORI.join(", ")} delle Condizioni Generali di Vendita P&amp;C sopra riportate.
            </p>
            <div className="flex justify-end mb-10">
              <RigaFirma label="Il Cliente (firma per approvazione specifica)" sub={preventivo.cliente.nome} />
            </div>

            <h2 className="text-sm font-bold mb-2" style={{ color: info.primary }}>
              Informativa privacy (art. 13 e ss. Regolamento UE 2016/679 — GDPR)
            </h2>
            <p className="text-neutral-700 whitespace-pre-line mb-4">{GDPR_INFORMATIVA}</p>

            <p className="font-medium mb-1">Dichiarazione di consenso</p>
            <p className="text-neutral-700 mb-4">{GDPR_CONSENSO}</p>
            <div className="flex justify-end mb-6">
              <RigaFirma label="Il Cliente" sub={preventivo.cliente.nome} />
            </div>

            <p className="font-medium mb-1">Consenso comunicazioni promozionali</p>
            <p className="text-neutral-700 mb-1">{CONSENSO_MARKETING}</p>
            <p className="text-neutral-400 mb-4">☐ Acconsento &nbsp;&nbsp;&nbsp; ☐ Non acconsento</p>

            <p className="font-medium mb-1">Consenso utilizzo fotografico</p>
            <p className="text-neutral-700 mb-1">{CONSENSO_FOTO}</p>
            <p className="text-neutral-400 mb-8">☐ Acconsento &nbsp;&nbsp;&nbsp; ☐ Non acconsento</p>

            <div className="flex justify-between mt-10">
              <RigaFirma label="Luogo e data" />
              <RigaFirma label="Il Cliente" sub={preventivo.cliente.nome} />
              <RigaFirma label="Il Fornitore" sub={`P&C — ${preventivo.commerciale.nome}`} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
