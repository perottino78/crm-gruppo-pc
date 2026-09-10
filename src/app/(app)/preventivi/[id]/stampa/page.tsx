export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { scopePreventivoWhere } from "@/lib/scope";
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
import {
  ARTICOLI_CONTRATTO_SOLARIS,
  ARTICOLI_VESSATORI_SOLARIS,
  INTRO_CONTRATTO_SOLARIS,
  DICHIARAZIONE_VESSATORIE_SOLARIS,
  CONSENSO_FOTO_SOLARIS,
} from "@/lib/condizioniGeneraliSolaris";

function RigaFirma({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="w-56">
      <div className="border-t border-neutral-400 pt-1">
        <p className="text-[10px] text-neutral-700">{label}</p>
        {sub && <p className="text-[9px] text-neutral-600">{sub}</p>}
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
  const utenteCorrente = await getCurrentUser();
  if (!utenteCorrente) notFound();

  const preventivo = await prisma.preventivo.findFirst({
    where: { id, ...scopePreventivoWhere(utenteCorrente) },
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
  const isSolaris = preventivo.brand.nome === "Solaris";

  const condizioniBrand = isPC
    ? {
        titolo: "CONDIZIONI GENERALI DI VENDITA P&C",
        intro: INTRO_CONTRATTO,
        articoli: ARTICOLI_CONTRATTO,
        vessatori: ARTICOLI_VESSATORI,
        dichiarazioneVessatorie: DICHIARAZIONE_VESSATORIE,
        gdprInformativa: GDPR_INFORMATIVA,
        gdprConsenso: GDPR_CONSENSO,
        consensoMarketing: CONSENSO_MARKETING,
        consensoFoto: CONSENSO_FOTO,
        nomeArticoli: "Condizioni Generali di Vendita P&C",
        fornitoreLabel: "P&C",
      }
    : isSolaris
    ? {
        titolo: "CONDIZIONI GENERALI DI VENDITA SOLARIS",
        intro: INTRO_CONTRATTO_SOLARIS,
        articoli: ARTICOLI_CONTRATTO_SOLARIS,
        vessatori: ARTICOLI_VESSATORI_SOLARIS,
        dichiarazioneVessatorie: DICHIARAZIONE_VESSATORIE_SOLARIS,
        gdprInformativa: GDPR_INFORMATIVA,
        gdprConsenso: GDPR_CONSENSO,
        consensoMarketing: CONSENSO_MARKETING,
        consensoFoto: CONSENSO_FOTO_SOLARIS,
        nomeArticoli: "Condizioni Generali di Vendita Solaris",
        fornitoreLabel: "Solaris",
      }
    : null;

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
  const numero = preventivo.numeroOfferta != null
    ? `${preventivo.numeroOfferta}/${anno}`
    : `${preventivo.id.slice(-6).toUpperCase()}/${anno}`; // fallback per preventivi creati prima della numerazione progressiva

  const eur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

  return (
    <div className="max-w-3xl mx-auto bg-white text-neutral-900 print:max-w-none">
      <PrintButton />

      {/* ===== PAGINA 1 — COPERTINA / OFFERTA ===== */}
      <section className="p-6 print:p-4 print:break-after-page">
        <div className="border-2 border-neutral-800 rounded-md p-6 print:p-6">
        {preventivo.immagineCopertinaUrl && (
          <img
            src={preventivo.immagineCopertinaUrl}
            alt="Copertina offerta"
            className="w-full max-h-64 object-cover rounded mb-6 border border-neutral-200"
          />
        )}
        <div className="flex items-center justify-between border-b-4 pb-4 mb-6" style={{ borderColor: info.primary }}>
          <div className="flex items-center gap-3">
            {info.logoUrl ? (
              <img src={info.logoUrl} alt={preventivo.brand.nome} className="h-14 w-auto object-contain" />
            ) : (
              <span
                className="w-12 h-12 rounded-md flex items-center justify-center text-white text-lg font-bold"
                style={{ background: info.primary }}
              >
                {preventivo.brand.nome.replace(/[^A-Z&]/g, "").slice(0, 2) || preventivo.brand.nome.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-lg font-bold">{preventivo.brand.nome}</p>
              {isPC ? (
                <p className="text-xs text-neutral-600">P&amp;C S.r.l. Unipersonale — Corso Moncenisio, 28 — 10090 Rosta (TO) — P.IVA 10741080013 — Tel. 011 19887497</p>
              ) : isSolaris ? (
                <p className="text-xs text-neutral-600">P&amp;C S.r.l. Unipersonale (marchio Solaris) — Corso Moncenisio, 28 — 10090 Rosta (TO) — P.IVA 10741080013 — Tel. 011 19887497</p>
              ) : (
                <p className="text-xs text-neutral-600">Gruppo P&amp;C</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">Offerta n° {numero}</p>
            <p className="text-xs text-neutral-600">{oggi}</p>
          </div>
        </div>

        {preventivo.oggetto && (
          <p className="text-base font-semibold mb-4" style={{ color: info.primary }}>{preventivo.oggetto}</p>
        )}

        <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
          <div className="border border-neutral-300 rounded-md p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 mb-1">Spett.le</p>
            <p className="font-semibold">{preventivo.cliente.nome}</p>
            <p className="text-neutral-700">{preventivo.cliente.indirizzo ?? ""}</p>
            {(preventivo.cliente.cap || preventivo.cliente.comune || preventivo.cliente.provincia) && (
              <p className="text-neutral-700">
                {[preventivo.cliente.cap, preventivo.cliente.comune].filter(Boolean).join(" ")}
                {preventivo.cliente.provincia && ` (${preventivo.cliente.provincia})`}
              </p>
            )}
            <p className="text-neutral-700">{preventivo.cliente.telefono ?? "—"} · {preventivo.cliente.email ?? "—"}</p>
          </div>
          <div className="border border-neutral-300 rounded-md p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 mb-1">Riferimento commerciale</p>
            <p className="font-semibold">{preventivo.commerciale.nome}</p>
            <p className="text-neutral-700">{preventivo.commerciale.telefono ?? "—"}</p>
            <p className="text-neutral-700">{preventivo.commerciale.email}</p>
          </div>
        </div>

        <table className="w-full text-sm mb-8">
          <thead>
            <tr className="text-left border-b-2 border-neutral-200 text-xs text-neutral-600">
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
                        <p className="text-xs text-neutral-600">
                          colore {r.prodotto.colore}
                          {haMisura(r.prodotto.larghezzaMm, r.prodotto.altezzaMm) && ` · ${larghezzaMostrata}×${altezzaMostrata}${unit}`}
                        </p>
                        {mostraScheda && descrizioneEffettiva && (
                          <p className="text-xs text-neutral-700 mt-1 max-w-md whitespace-pre-line">{descrizioneEffettiva}</p>
                        )}
                        {r.optionali.map((ro) => (
                          <p key={ro.id} className="text-xs text-neutral-600">+ {ro.optional.nome} ({ro.quantita}×)</p>
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
              <span className="text-neutral-700">Imponibile</span>
              <span>{eur(imponibileLordo)}</span>
            </div>
            {sconto > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-neutral-700">Sconto ({sconto}%)</span>
                <span>-{eur(imponibileLordo - totaleNetto)}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-neutral-700">Imponibile {sconto > 0 ? "scontato" : ""}</span>
              <span>{eur(totaleNetto)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-neutral-700">IVA ({preventivo.aliquotaIva}%)</span>
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
              <p className="text-neutral-600 mb-1">Condizioni di pagamento</p>
              <p className="text-neutral-600 whitespace-pre-line">{preventivo.condizioniPagamento ?? "Da definire."}</p>
            </div>
            <div>
              <p className="text-neutral-600 mb-1">Condizioni di consegna</p>
              <p className="text-neutral-600 whitespace-pre-line">{preventivo.condizioniConsegna ?? "Da definire."}</p>
            </div>
          </div>
        )}

        {condizioniBrand ? (
          <p className="text-[10px] text-neutral-600 mb-6">
            L'Acquirente dichiara di aver ricevuto, letto e accettato, sottoscrivendo la presente offerta, le
            "{condizioniBrand.nomeArticoli}" riportate nelle pagine seguenti, che formano parte integrante
            e sostanziale del presente Contratto.
          </p>
        ) : (
          <p className="text-xs text-neutral-500 border-t border-neutral-100 pt-4 mb-6">
            Offerta valida 30 giorni dalla data di emissione salvo diversa indicazione. Prezzi espressi in Euro.
            {" "}{preventivo.brand.nome} — Gruppo P&amp;C — documento generato dal CRM interno.
          </p>
        )}

        <div className="flex justify-between mt-10">
          <RigaFirma label="Luogo e data" />
          <RigaFirma label="Il Cliente (per accettazione)" sub={preventivo.cliente.nome} />
          <RigaFirma label="Il Fornitore" sub={isPC ? "P&C S.r.l. Unipersonale" : isSolaris ? "P&C S.r.l. Unipersonale — Solaris" : preventivo.brand.nome} />
        </div>
        </div>
      </section>

      {condizioniBrand && (
        <>
          {/* ===== CONDIZIONI GENERALI DI VENDITA — ARTICOLI ===== */}
          <section className="p-10 print:p-8 print:break-after-page text-[9.5px] leading-snug">
            <h2 className="text-sm font-bold mb-1" style={{ color: info.primary }}>{condizioniBrand.titolo}</h2>
            <p className="text-[9px] text-neutral-700 mb-4">{condizioniBrand.intro}</p>
            {condizioniBrand.articoli.map((a) => (
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
            <p className="text-neutral-700 mb-2">{condizioniBrand.dichiarazioneVessatorie}</p>
            <p className="font-medium mb-6">
              Artt. {condizioniBrand.vessatori.join(", ")} delle {condizioniBrand.nomeArticoli} sopra riportate.
            </p>
            <div className="flex justify-end mb-10">
              <RigaFirma label="Il Cliente (firma per approvazione specifica)" sub={preventivo.cliente.nome} />
            </div>

            <h2 className="text-sm font-bold mb-2" style={{ color: info.primary }}>
              Informativa privacy (art. 13 e ss. Regolamento UE 2016/679 — GDPR)
            </h2>
            <p className="text-neutral-700 whitespace-pre-line mb-4">{condizioniBrand.gdprInformativa}</p>

            <p className="font-medium mb-1">Dichiarazione di consenso</p>
            <p className="text-neutral-700 mb-4">{condizioniBrand.gdprConsenso}</p>
            <div className="flex justify-end mb-6">
              <RigaFirma label="Il Cliente" sub={preventivo.cliente.nome} />
            </div>

            <p className="font-medium mb-1">Consenso comunicazioni promozionali</p>
            <p className="text-neutral-700 mb-1">{condizioniBrand.consensoMarketing}</p>
            <p className="text-neutral-600 mb-4">☐ Acconsento &nbsp;&nbsp;&nbsp; ☐ Non acconsento</p>

            <p className="font-medium mb-1">Consenso utilizzo fotografico</p>
            <p className="text-neutral-700 mb-1">{condizioniBrand.consensoFoto}</p>
            <p className="text-neutral-600 mb-8">☐ Acconsento &nbsp;&nbsp;&nbsp; ☐ Non acconsento</p>

            <div className="flex justify-between mt-10">
              <RigaFirma label="Luogo e data" />
              <RigaFirma label="Il Cliente" sub={preventivo.cliente.nome} />
              <RigaFirma label="Il Fornitore" sub={`${condizioniBrand.fornitoreLabel} — ${preventivo.commerciale.nome}`} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
