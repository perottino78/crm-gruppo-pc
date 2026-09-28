export const dynamic = "force-dynamic";

import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { scopePreventivoWhere } from "@/lib/scope";
import { brandInfo } from "@/lib/brands";
import { unitaMisura, haMisura } from "@/lib/prodotti";
import { CONDIZIONI_PAGAMENTO_DEFAULT, CONDIZIONI_CONSEGNA_DEFAULT } from "@/lib/condizioniOfferta";
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
import {
  TITOLO_CONDIZIONI_POSA_WS,
  INTRO_CONDIZIONI_POSA_WS,
  VOCI_CONDIZIONI_POSA_WS,
} from "@/lib/condizioniPosaWS";

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
        orderBy: [{ ordine: "asc" }, { id: "asc" }],
      },
      sezioni: { orderBy: [{ ordine: "asc" }, { id: "asc" }] },
    },
  });
  if (!preventivo) notFound();

  const tipologiePresenti = [
    ...new Set(preventivo.righe.filter((r) => r.prodotto).map((r) => r.prodotto!.tipologia)),
  ];
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

  // Vero se il preventivo contiene almeno una voce di rilievo/posa in opera
  // Work&Service (marcate dal suffisso "(Work&Service)" nella categoria
  // dell'optional, vedi condizioniPosaWS.ts) — in tal caso in stampa vengono
  // aggiunte le condizioni contrattuali del subappaltatore.
  const haPosaWS = preventivo.righe.some((r) =>
    r.optionali.some((ro) => ro.optional.categoria.endsWith("(Work&Service)"))
  );

  const imponibileLordo = preventivo.righe.reduce((sum, r) => {
    const subOptionali = r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
    return sum + r.quantita * r.prezzoUnitario + r.optionalPrezzo + subOptionali;
  }, 0);
  const sconto = preventivo.scontoPercentuale ?? 0;
  const totaleNetto = preventivo.totaleNetto;
  const totaleIva = preventivo.totaleIva;
  const totaleFinale = totaleNetto + totaleIva;
  // Prezzo manuale: quando attivo, la stampa non deve rivelare al cliente ne' l'imponibile
  // lordo di calcolo ne' la percentuale di sconto applicata — mostra solo un imponibile+IVA
  // "puliti" ricavati a ritroso dal totale finale scritto a mano, indistinguibili da un
  // preventivo calcolato normalmente.
  const prezzoManualeAttivo = preventivo.prezzoManualeAttivo;

  const oggi = new Date().toLocaleDateString("it-IT");
  const anno = preventivo.createdAt.getFullYear();

  const subtotaleRiga = (r: (typeof preventivo.righe)[number]): number => {
    if (!r.prodotto) return r.quantita * r.prezzoUnitario;
    const subOptionali = r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
    return r.quantita * r.prezzoUnitario + r.optionalPrezzo + subOptionali;
  };

  const renderRigaStampa = (r: (typeof preventivo.righe)[number]) => {
    if (!r.prodotto) {
      const subtotaleLibero = r.quantita * r.prezzoUnitario;
      return (
        <tr key={r.id} className="border-b border-neutral-100 align-top">
          <td className="py-2" colSpan={r.prezzoUnitario === 0 ? 4 : 1}>
            <p className="text-neutral-700 whitespace-pre-line italic">{r.testoLibero}</p>
          </td>
          {r.prezzoUnitario !== 0 && (
            <>
              <td className="py-2 text-center">{r.quantita}</td>
              <td className="py-2 text-right">{eur(r.prezzoUnitario)}</td>
              <td className="py-2 text-right font-medium">{eur(subtotaleLibero)}</td>
            </>
          )}
        </tr>
      );
    }
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
              {r.optionali.map((ro) => {
                const nomeOptional = ro.optional.categoria.startsWith("Tessuto - ")
                  ? `${ro.optional.categoria.replace("Tessuto - ", "")} ${ro.optional.nome}`
                  : ro.optional.categoria.startsWith("Motore - ") && ro.optional.categoria !== "Motore - Manuale"
                  ? `${ro.optional.categoria.replace("Motore - ", "")} ${ro.optional.nome}`
                  : ro.optional.nome.includes("scrittura libera") || ro.optional.nome.includes("da definire")
                  ? ro.optional.categoria.replace(/^Pannello( Interno - (STD|A pagamento))?$/, (_m, _g1, tipo) =>
                      tipo === "STD" ? "Pannello interno STD" : tipo === "A pagamento" ? "Pannello interno a pagamento" : "Pannello esterno"
                    )
                  : ro.optional.nome;
                return (
                  <p key={ro.id} className="text-xs text-neutral-600">
                    + {nomeOptional}
                    {ro.nota ? ` — "${ro.nota}"` : ""} ({ro.quantita}×)
                  </p>
                );
              })}
            </div>
          </div>
        </td>
        <td className="py-2 text-center">{r.quantita}</td>
        <td className="py-2 text-right">{eur(r.prezzoUnitario)}</td>
        <td className="py-2 text-right font-medium">{eur(subtotale)}</td>
      </tr>
    );
  };

  const righeSenzaSezione = preventivo.righe.filter((r) => !r.sezioneId);
  const sezioniConRighe = preventivo.sezioni.map((sezione) => ({
    sezione,
    righe: preventivo.righe.filter((r) => r.sezioneId === sezione.id),
  }));
  const mostraIntestazioniSezione = sezioniConRighe.some((s) => s.righe.length > 0);
  const numero = preventivo.numeroOfferta != null
    ? `${preventivo.numeroOfferta}/${anno}`
    : `${preventivo.id.slice(-6).toUpperCase()}/${anno}`; // fallback per preventivi creati prima della numerazione progressiva

  const eur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

  return (
    <div className="max-w-3xl mx-auto bg-white text-neutral-900 print:max-w-none">
      <style>{`@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }`}</style>
      <PrintButton />

      {/* ===== PAGINA 1 — COPERTINA / OFFERTA ===== */}
      <section className="p-6 print:p-4 print:break-after-page">
        <div className="relative rounded-2xl border border-neutral-200 shadow-sm print:shadow-none overflow-hidden">
        <div className="h-2.5" style={{ background: `linear-gradient(90deg, ${info.primary}, ${info.accent})` }} />
        <div className="p-6 print:p-6">
        {preventivo.immagineCopertinaUrl && (
          <div className="w-full mb-6 rounded-lg border border-neutral-200 bg-neutral-50 flex items-center justify-center overflow-hidden" style={{ maxHeight: 420 }}>
            <img
              src={preventivo.immagineCopertinaUrl}
              alt="Copertina offerta"
              className="max-w-full object-contain"
              style={{ maxHeight: 420 }}
            />
          </div>
        )}
        <div className="flex items-center justify-between pb-4 mb-6 border-b" style={{ borderColor: `${info.primary}33` }}>
          <div className="flex items-center gap-3">
            {info.logoUrl ? (
              <img src={info.logoUrl} alt={preventivo.brand.nome} className="h-14 w-auto object-contain" />
            ) : (
              <span
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-sm"
                style={{ background: `linear-gradient(135deg, ${info.primary}, ${info.accent})` }}
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
            <span
              className="inline-block text-sm font-semibold px-3 py-1 rounded-full"
              style={{ background: info.primarySoft, color: info.primary }}
            >
              Offerta n° {numero}
            </span>
            <p className="text-xs text-neutral-500 mt-1.5">{oggi}</p>
          </div>
        </div>

        {preventivo.oggetto && (
          <div className="mb-4">
            <span
              className="inline-block text-sm font-semibold px-3 py-1.5 rounded-full"
              style={{ background: info.primarySoft, color: info.primary }}
            >
              {preventivo.oggetto}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
          <div className="rounded-lg p-3 border" style={{ background: info.primarySoft, borderColor: `${info.primary}33` }}>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: info.primary }}>Spett.le</p>
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
          <div className="rounded-lg p-3 border" style={{ background: info.primarySoft, borderColor: `${info.primary}33` }}>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: info.primary }}>Riferimento commerciale</p>
            <p className="font-semibold">{preventivo.commerciale.nome}</p>
            <p className="text-neutral-700">{preventivo.commerciale.telefono ?? "—"}</p>
            <p className="text-neutral-700">{preventivo.commerciale.email}</p>
          </div>
        </div>

        <table className="w-full text-sm mb-8 border-separate" style={{ borderSpacing: 0 }}>
          <thead>
            <tr className="text-left text-xs" style={{ background: info.primarySoft }}>
              <th className="py-2 px-2 rounded-l-lg" style={{ color: info.primary }}>Descrizione</th>
              <th className="py-2 px-2 text-center" style={{ color: info.primary }}>Qtà</th>
              <th className="py-2 px-2 text-right" style={{ color: info.primary }}>Prezzo unit.</th>
              <th className="py-2 px-2 text-right rounded-r-lg" style={{ color: info.primary }}>Totale</th>
            </tr>
          </thead>
          <tbody className="[&>tr:nth-child(even)]:bg-neutral-50">
            {mostraIntestazioniSezione && righeSenzaSezione.length > 0 && (
              <tr>
                <td colSpan={4} className="pt-3 pb-1 px-2 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                  Senza sezione
                </td>
              </tr>
            )}
            {righeSenzaSezione.map((r) => renderRigaStampa(r))}
            {mostraIntestazioniSezione &&
              sezioniConRighe.map(({ sezione, righe }) => {
                if (righe.length === 0) return null;
                const totaleSezione = righe.reduce((s, r) => s + subtotaleRiga(r), 0);
                return (
                  <Fragment key={sezione.id}>
                    <tr>
                      <td colSpan={3} className="pt-4 pb-1.5 px-2">
                        <span
                          className="inline-block text-xs font-bold uppercase tracking-wide text-white px-3 py-1 rounded-full"
                          style={{ background: info.accent }}
                        >
                          🏠 {sezione.nome}
                        </span>
                      </td>
                      <td className="pt-4 pb-1.5 px-2 text-right text-xs font-bold" style={{ color: info.accent }}>
                        {eur(totaleSezione)}
                      </td>
                    </tr>
                    {righe.map((r) => renderRigaStampa(r))}
                  </Fragment>
                );
              })}
          </tbody>
        </table>

        <div className="flex justify-end mb-8">
          <div className="w-72 rounded-xl border overflow-hidden" style={{ borderColor: `${info.primary}33` }}>
            <div className="p-3 text-sm" style={{ background: info.primarySoft }}>
              {!prezzoManualeAttivo && (
                <div className="flex justify-between py-1">
                  <span className="text-neutral-700">Imponibile</span>
                  <span>{eur(imponibileLordo)}</span>
                </div>
              )}
              {!prezzoManualeAttivo && sconto > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-neutral-700">Sconto ({sconto}%)</span>
                  <span>-{eur(imponibileLordo - totaleNetto)}</span>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="text-neutral-700">Imponibile {!prezzoManualeAttivo && sconto > 0 ? "scontato" : ""}</span>
                <span>{eur(totaleNetto)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-700">IVA ({preventivo.aliquotaIva}%)</span>
                <span>{eur(totaleIva)}</span>
              </div>
            </div>
            <div className="flex justify-between py-2.5 px-3 font-semibold text-white" style={{ background: info.primary }}>
              <span>Totale a pagare</span>
              <span>{eur(totaleFinale)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-xs">
          <div className="rounded-lg p-3 bg-neutral-50 border-l-4" style={{ borderColor: info.primary }}>
            <p className="mb-1 font-semibold" style={{ color: info.primary }}>Condizioni di pagamento</p>
            <p className="text-neutral-700 whitespace-pre-line">{preventivo.condizioniPagamento ?? CONDIZIONI_PAGAMENTO_DEFAULT}</p>
          </div>
          <div className="rounded-lg p-3 bg-neutral-50 border-l-4" style={{ borderColor: info.accent }}>
            <p className="mb-1 font-semibold" style={{ color: info.accent }}>Condizioni di consegna</p>
            <p className="text-neutral-700 whitespace-pre-line">{preventivo.condizioniConsegna ?? CONDIZIONI_CONSEGNA_DEFAULT}</p>
          </div>
        </div>

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
        </div>
      </section>

      {haPosaWS && (
        <section className="p-10 print:p-8 print:break-after-page text-[9.5px] leading-snug border-l-4" style={{ borderColor: info.accent }}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold pb-1 border-b-2" style={{ color: info.primary, borderColor: `${info.primary}55` }}>{TITOLO_CONDIZIONI_POSA_WS}</h2>
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-3" style={{ background: info.primarySoft, color: info.primary }}>{preventivo.brand.nome}</span>
          </div>
          <p className="text-[9px] text-neutral-700 mb-4 mt-2">{INTRO_CONDIZIONI_POSA_WS}</p>
          {VOCI_CONDIZIONI_POSA_WS.map((v) => (
            <div key={v.titolo} className="mb-2.5 print:break-inside-avoid">
              <p className="font-semibold" style={{ color: info.accent }}>{v.titolo}</p>
              <p className="text-justify text-neutral-700">{v.testo}</p>
            </div>
          ))}
        </section>
      )}

      {condizioniBrand && (
        <>
          {/* ===== CONDIZIONI GENERALI DI VENDITA — ARTICOLI ===== */}
          <section className="p-10 print:p-8 print:break-after-page text-[9.5px] leading-snug border-l-4" style={{ borderColor: info.primary }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold pb-1 border-b-2" style={{ color: info.primary, borderColor: `${info.primary}55` }}>{condizioniBrand.titolo}</h2>
              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-3" style={{ background: info.primarySoft, color: info.primary }}>{preventivo.brand.nome}</span>
            </div>
            <p className="text-[9px] text-neutral-700 mb-4 mt-2">{condizioniBrand.intro}</p>
            {condizioniBrand.articoli.map((a) => (
              <div key={a.numero} className="mb-2.5 print:break-inside-avoid">
                <p className="font-semibold" style={{ color: info.accent }}>Art. {a.numero} — {a.titolo}</p>
                <p className="text-justify text-neutral-700">{a.testo}</p>
              </div>
            ))}
          </section>

          {/* ===== ACCETTAZIONE CLAUSOLE VESSATORIE (art. 1341-1342 c.c.) ===== */}
          <section className="p-10 print:p-8 print:break-after-page text-xs border-l-4" style={{ borderColor: info.primary }}>
            <h2 className="text-sm font-bold mb-3 pb-1 border-b-2" style={{ color: info.primary, borderColor: `${info.primary}55` }}>
              Approvazione specifica delle clausole ai sensi degli artt. 1341 e 1342 c.c.
            </h2>
            <p className="text-neutral-700 mb-2">{condizioniBrand.dichiarazioneVessatorie}</p>
            <p className="font-medium mb-6">
              Artt. {condizioniBrand.vessatori.join(", ")} delle {condizioniBrand.nomeArticoli} sopra riportate.
            </p>
            <div className="flex justify-end mb-10">
              <RigaFirma label="Il Cliente (firma per approvazione specifica)" sub={preventivo.cliente.nome} />
            </div>

            <h2 className="text-sm font-bold mb-2 pb-1 border-b-2" style={{ color: info.primary, borderColor: `${info.primary}55` }}>
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
