export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { brandInfo } from "@/lib/brands";
import { unitaMisura, listinoDiTipologia, etichetteDimensioni, haMisura } from "@/lib/prodotti";
import {
  aggiungiRigaPreventivo,
  aggiungiRigaPreventivoPerMisura,
  rimuoviRigaPreventivo,
  aggiungiOptionalARiga,
  rimuoviOptionalDaRiga,
  aggiornaStatoPreventivo,
  toggleDescrizioneRiga,
  aggiornaDescrizionePersonalizzata,
  aggiornaCondizioniOfferta,
} from "@/app/actions";
import SelettoreProdotto, { type FamigliaNodo, type NodoTipologia } from "@/components/SelettoreProdotto";

const STATI = ["APERTO", "ACCETTATO", "SCADUTO", "ANNULLATO"];

export default async function PreventivoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; errore?: string }>;
}) {
  const { id } = await params;
  const { q, errore } = await searchParams;

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

  const [optionaliDisponibili, prodottiTrovati, tipologieMisure, modelliBrand] = await Promise.all([
    prisma.optional.findMany({ where: { brandId: preventivo.brandId }, orderBy: [{ categoria: "asc" }, { nome: "asc" }] }),
    q
      ? prisma.prodotto.findMany({
          where: {
            brandId: preventivo.brandId,
            OR: [
              { tipologia: { contains: q, mode: "insensitive" as const } },
              { colore: { contains: q, mode: "insensitive" as const } },
            ],
          },
          take: 25,
          orderBy: [{ tipologia: "asc" }, { altezzaMm: "asc" }],
        })
      : [],
    prisma.prodotto.groupBy({
      by: ["tipologia"],
      where: { brandId: preventivo.brandId },
      orderBy: { tipologia: "asc" },
      _min: { larghezzaMm: true, altezzaMm: true },
      _max: { larghezzaMm: true, altezzaMm: true },
    }),
    prisma.modelloProdotto.findMany({ where: { brandId: preventivo.brandId } }),
  ]);

  const modelloBrandMap = new Map(modelliBrand.map((m) => [m.tipologia, m]));
  const tipologieSenzaMisura = tipologieMisure
    .filter((t) => !haMisura(t._max.larghezzaMm ?? 0, t._max.altezzaMm ?? 0))
    .map((t) => t.tipologia);

  const variantiSenzaMisura = tipologieSenzaMisura.length
    ? await prisma.prodotto.findMany({
        where: { brandId: preventivo.brandId, tipologia: { in: tipologieSenzaMisura } },
        select: { id: true, tipologia: true, colore: true, prezzoBase: true },
        orderBy: [{ tipologia: "asc" }, { colore: "asc" }],
      })
    : [];
  const variantiPerTipologia = new Map<string, { id: string; colore: string; prezzoBase: number }[]>();
  for (const v of variantiSenzaMisura) {
    if (!variantiPerTipologia.has(v.tipologia)) variantiPerTipologia.set(v.tipologia, []);
    variantiPerTipologia.get(v.tipologia)!.push({ id: v.id, colore: v.colore, prezzoBase: v.prezzoBase });
  }

  // raggruppa le tipologie in un albero Famiglia (Indoor/Outdoor) > Gruppo > Modello,
  // rispecchiando l'organizzazione dei cataloghi cartacei, per la navigazione a tendina
  const alberoMap = new Map<string, Map<string, NodoTipologia[]>>();
  for (const t of tipologieMisure) {
    const tip = t.tipologia;
    const m = modelloBrandMap.get(tip);
    const famiglia = m?.famiglia ?? "Altro";
    const gruppo = m?.gruppo ?? "Altro";
    if (!alberoMap.has(famiglia)) alberoMap.set(famiglia, new Map());
    const perGruppo = alberoMap.get(famiglia)!;
    if (!perGruppo.has(gruppo)) perGruppo.set(gruppo, []);
    const conMisura = haMisura(t._max.larghezzaMm ?? 0, t._max.altezzaMm ?? 0);
    perGruppo.get(gruppo)!.push({
      value: tip,
      label: tip.replace(/_/g, " "),
      haMisura: conMisura,
      varianti: variantiPerTipologia.get(tip),
      misure: conMisura
        ? {
            larghezzaMin: t._min.larghezzaMm ?? 0,
            larghezzaMax: t._max.larghezzaMm ?? 0,
            altezzaMin: t._min.altezzaMm ?? 0,
            altezzaMax: t._max.altezzaMm ?? 0,
          }
        : undefined,
    });
  }
  const ordineFamiglie = ["INDOOR", "OUTDOOR"];
  const tassonomia: FamigliaNodo[] = [...alberoMap.entries()]
    .sort(([a], [b]) => {
      const ia = ordineFamiglie.indexOf(a);
      const ib = ordineFamiglie.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    })
    .map(([nome, gruppi]) => ({
      nome,
      gruppi: [...gruppi.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([gnome, tipologie]) => ({
          nome: gnome,
          tipologie: tipologie.sort((a, b) => a.label.localeCompare(b.label)),
        })),
    }));

  const tipologiePresenti = [...new Set(preventivo.righe.map((r) => r.prodotto.tipologia))];
  const modelli = tipologiePresenti.length
    ? await prisma.modelloProdotto.findMany({ where: { brandId: preventivo.brandId, tipologia: { in: tipologiePresenti } } })
    : [];
  const modelloMap = new Map(modelli.map((m) => [m.tipologia, m]));

  const info = brandInfo(preventivo.brand.nome);
  const totaleFinale = preventivo.totaleNetto + preventivo.totaleIva;

  return (
    <div className="max-w-5xl">
      <Link href={`/clienti/${preventivo.clienteId}`} className="text-xs text-neutral-400 hover:underline">
        ← {preventivo.cliente.nome}
      </Link>

      <div className="flex items-center justify-between mt-2 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-medium">Preventivo — {preventivo.cliente.nome}</h1>
          <span
            className="text-xs font-medium px-3 py-1.5 rounded-full border"
            style={{ background: info.primarySoft, color: info.primary, borderColor: info.primary }}
          >
            {preventivo.brand.nome}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/preventivi/${preventivo.id}/stampa`}
            target="_blank"
            className="btn-3d btn-3d-dark text-sm px-3 py-1.5"
          >
            🖨️ Stampa offerta
          </Link>
        </div>
      </div>

      {errore && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          ⚠️ {errore}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <p className="text-xs text-neutral-400 mb-1">Commerciale</p>
          <p className="text-sm font-medium">{preventivo.commerciale.nome}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <p className="text-xs text-neutral-400 mb-1">Stato</p>
          <form action={aggiornaStatoPreventivo} className="flex items-center gap-1">
            <input type="hidden" name="id" value={preventivo.id} />
            <select name="stato" defaultValue={preventivo.stato} className="text-sm border border-neutral-200 rounded px-1.5 py-0.5">
              {STATI.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button className="btn-3d btn-3d-blue text-[11px] px-2 py-1">salva</button>
          </form>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <p className="text-xs text-neutral-400 mb-1">Netto{preventivo.scontoPercentuale > 0 ? ` (scontato ${preventivo.scontoPercentuale}%)` : ""}</p>
          <p className="text-sm font-medium">{preventivo.totaleNetto.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</p>
        </div>
        <div className="bg-neutral-900 rounded-lg p-4">
          <p className="text-xs text-neutral-300 mb-1">Totale (IVA {preventivo.aliquotaIva}%)</p>
          <p className="text-sm font-medium text-white">{totaleFinale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</p>
        </div>
      </div>

      <details className="bg-white rounded-lg border border-neutral-200 mb-6">
        <summary className="cursor-pointer text-sm font-medium text-neutral-700 px-4 py-3">
          Condizioni offerta (oggetto, sconto, pagamento, consegna) — usate nella stampa
        </summary>
        <form action={aggiornaCondizioniOfferta} className="px-4 pb-4 flex flex-col gap-3">
          <input type="hidden" name="id" value={preventivo.id} />
          <div>
            <label className="text-xs text-neutral-400 block mb-1">Oggetto offerta</label>
            <input
              name="oggetto"
              defaultValue={preventivo.oggetto ?? ""}
              placeholder="es. Zanzariere plissettate bilaterali"
              className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-400 block mb-1">Sconto (%)</label>
              <input
                name="scontoPercentuale"
                type="number"
                step="0.1"
                min={0}
                max={100}
                defaultValue={preventivo.scontoPercentuale}
                className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-1">Condizioni di pagamento</label>
            <textarea
              name="condizioniPagamento"
              rows={2}
              defaultValue={preventivo.condizioniPagamento ?? ""}
              placeholder="es. Bonifico. Acconto 50%, saldo 50% a merce pronta a magazzino."
              className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-1">Condizioni di consegna</label>
            <textarea
              name="condizioniConsegna"
              rows={2}
              defaultValue={preventivo.condizioniConsegna ?? ""}
              placeholder="es. Consegna 60 gg indicativi da rilievo tecnico esecutivo e da bonifico di acconto."
              className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5"
            />
          </div>
          <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5 self-start">salva condizioni</button>
        </form>
      </details>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">Righe ({preventivo.righe.length})</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-6">
        {preventivo.righe.map((r) => {
          const subOptionali = r.optionali.reduce((s, o) => s + o.quantita * o.prezzoUnitario, 0);
          const subtotale = r.quantita * r.prezzoUnitario + r.optionalPrezzo + subOptionali;
          const modello = modelloMap.get(r.prodotto.tipologia);
          const unit = unitaMisura(r.prodotto.tipologia);
          const larghezzaMostrata = r.misuraLarghezza ?? r.prodotto.larghezzaMm;
          const altezzaMostrata = r.misuraAltezza ?? r.prodotto.altezzaMm;
          const descrizioneEffettiva = r.descrizionePersonalizzata ?? modello?.descrizioneTecnica ?? "";
          return (
            <div key={r.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {modello?.immagineUrl && (
                    <img src={modello.immagineUrl} alt={r.prodotto.tipologia} className="w-12 h-12 object-cover rounded border border-neutral-200" />
                  )}
                  <div>
                    <p className="font-medium">
                      {r.prodotto.tipologia} · {r.prodotto.colore}
                      {haMisura(r.prodotto.larghezzaMm, r.prodotto.altezzaMm) && ` · ${larghezzaMostrata}×${altezzaMostrata}${unit}`}
                      {r.misuraLarghezza && (
                        <span className="text-neutral-400 font-normal"> (fascia listino {r.prodotto.larghezzaMm}×{r.prodotto.altezzaMm}{unit})</span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-400">{r.quantita} × {r.prezzoUnitario.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{subtotale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
                  <form action={rimuoviRigaPreventivo}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="preventivoId" value={preventivo.id} />
                    <button className="btn-3d btn-3d-red text-[11px] px-2 py-1">rimuovi</button>
                  </form>
                </div>
              </div>

              {(modello?.descrizioneTecnica || r.descrizionePersonalizzata) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <form action={toggleDescrizioneRiga}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="preventivoId" value={preventivo.id} />
                    <input type="hidden" name="mostra" value={(!r.mostraDescrizione).toString()} />
                    <button className={`text-[11px] px-2 py-0.5 rounded-full border ${r.mostraDescrizione ? "border-green-200 bg-green-50 text-green-700" : "border-neutral-200 text-neutral-400"}`}>
                      {r.mostraDescrizione ? "✓ descrizione visibile in offerta" : "descrizione nascosta — clicca per mostrarla"}
                    </button>
                  </form>
                  {r.descrizionePersonalizzata && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                      testo personalizzato per questa riga
                    </span>
                  )}
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-neutral-400 hover:text-neutral-700">✏️ modifica testo descrizione</summary>
                    <form action={aggiornaDescrizionePersonalizzata} className="mt-1.5 flex flex-col gap-1.5 max-w-lg">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="preventivoId" value={preventivo.id} />
                      <textarea
                        name="descrizionePersonalizzata"
                        defaultValue={descrizioneEffettiva}
                        rows={3}
                        className="border border-neutral-200 rounded px-2 py-1.5 text-xs w-full"
                      />
                      <div className="flex gap-2">
                        <button className="btn-3d btn-3d-blue text-[11px] px-2 py-1">salva testo per questa riga</button>
                        {r.descrizionePersonalizzata && (
                          <button
                            formAction={aggiornaDescrizionePersonalizzata}
                            name="descrizionePersonalizzata"
                            value=""
                            className="btn-3d btn-3d-outline text-[11px] px-2 py-1"
                          >
                            ripristina descrizione standard
                          </button>
                        )}
                      </div>
                    </form>
                  </details>
                </div>
              )}

              {r.optionali.length > 0 && (
                <div className="mt-2 pl-3 border-l-2 border-neutral-100 flex flex-col gap-1">
                  {r.optionali.map((ro) => (
                    <div key={ro.id} className="flex items-center justify-between text-xs text-neutral-500">
                      <span>+ {ro.optional.nome} ({ro.quantita}×{ro.prezzoUnitario.toLocaleString("it-IT", { style: "currency", currency: "EUR" })})</span>
                      <form action={rimuoviOptionalDaRiga}>
                        <input type="hidden" name="id" value={ro.id} />
                        <input type="hidden" name="preventivoId" value={preventivo.id} />
                        <button className="text-red-400 hover:text-red-600">rimuovi</button>
                      </form>
                    </div>
                  ))}
                </div>
              )}

              <form action={aggiungiOptionalARiga} className="mt-2 flex items-center gap-1">
                <input type="hidden" name="rigaId" value={r.id} />
                <input type="hidden" name="preventivoId" value={preventivo.id} />
                <select name="optionalId" className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]">
                  {optionaliDisponibili
                    .filter((o) => o.listino === null || o.listino === listinoDiTipologia(r.prodotto.tipologia))
                    .filter((o) => o.gruppiApplicabili.length === 0 || (modello?.gruppo && o.gruppiApplicabili.includes(modello.gruppo)))
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.categoria} · {o.nome} ({o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})
                      </option>
                    ))}
                </select>
                <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
                <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ optional</button>
              </form>
            </div>
          );
        })}
        {preventivo.righe.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-400">Nessun prodotto ancora — aggiungilo qui sotto.</p>
        )}
      </div>

      <SelettoreProdotto
        preventivoId={preventivo.id}
        brandId={preventivo.brandId}
        brandColor={info.primary}
        tassonomia={tassonomia}
        azionePerMisura={aggiungiRigaPreventivoPerMisura}
        azionePerProdotto={aggiungiRigaPreventivo}
      />

      <details className="mb-6">
        <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-700">
          Ricerca avanzata — sfoglia le combinazioni di misura già a listino (prezzo modificabile)
        </summary>
        <div className="mt-3">
          <form className="flex items-end gap-2 mb-4" action={`/preventivi/${preventivo.id}`} method="get">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-neutral-500">Cerca tipologia o colore</label>
              <input name="q" defaultValue={q ?? ""} placeholder="es. FF1, LUCILLA_PARETE..." className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <button className="btn-3d btn-3d-dark text-sm px-3 py-1.5">Cerca</button>
          </form>

          {prodottiTrovati.length > 0 && (
            <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
              {prodottiTrovati.map((p) => (
                <form
                  key={p.id}
                  action={aggiungiRigaPreventivo}
                  className="flex items-center justify-between px-4 py-2.5 text-sm gap-2"
                >
                  <input type="hidden" name="preventivoId" value={preventivo.id} />
                  <input type="hidden" name="prodottoId" value={p.id} />
                  <span className="flex-1">
                    {p.tipologia} · {p.colore}
                    {haMisura(p.larghezzaMm, p.altezzaMm) && ` · ${p.larghezzaMm}×${p.altezzaMm}${unitaMisura(p.tipologia)}`}
                  </span>
                  <input name="quantita" type="number" defaultValue={1} min={1} className="border border-neutral-200 rounded px-1.5 py-1 text-xs w-14" />
                  <input
                    name="prezzoUnitario"
                    type="number"
                    step="0.01"
                    defaultValue={p.prezzoBase}
                    className="border border-neutral-200 rounded px-1.5 py-1 text-xs w-24"
                  />
                  <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ aggiungi</button>
                </form>
              ))}
            </div>
          )}
          {q && prodottiTrovati.length === 0 && (
            <p className="text-sm text-neutral-400">Nessun prodotto trovato per &quot;{q}&quot; nel brand {preventivo.brand.nome}.</p>
          )}
        </div>
      </details>
    </div>
  );
}
