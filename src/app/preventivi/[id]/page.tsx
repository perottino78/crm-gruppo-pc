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
} from "@/app/actions";

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

  const [optionaliDisponibili, prodottiTrovati, tipologieGruppi, modelliBrand] = await Promise.all([
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
    prisma.prodotto.groupBy({ by: ["tipologia"], where: { brandId: preventivo.brandId }, orderBy: { tipologia: "asc" } }),
    prisma.modelloProdotto.findMany({ where: { brandId: preventivo.brandId } }),
  ]);

  const modelloBrandMap = new Map(modelliBrand.map((m) => [m.tipologia, m]));
  const tipologieDisponibili = tipologieGruppi.map((t) => t.tipologia);

  // raggruppa le tipologie per famiglia/gruppo (scheda tecnica) per il menu a tendina
  const gruppiOrdinati = new Map<string, string[]>();
  for (const tip of tipologieDisponibili) {
    const m = modelloBrandMap.get(tip);
    const chiave = m?.famiglia && m?.gruppo ? `${m.famiglia} · ${m.gruppo}` : "Altro";
    if (!gruppiOrdinati.has(chiave)) gruppiOrdinati.set(chiave, []);
    gruppiOrdinati.get(chiave)!.push(tip);
  }

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
          <p className="text-xs text-neutral-400 mb-1">Netto</p>
          <p className="text-sm font-medium">{preventivo.totaleNetto.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</p>
        </div>
        <div className="bg-neutral-900 rounded-lg p-4">
          <p className="text-xs text-neutral-300 mb-1">Totale (IVA {preventivo.aliquotaIva}%)</p>
          <p className="text-sm font-medium text-white">{totaleFinale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</p>
        </div>
      </div>

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

      <h2 className="text-sm font-medium text-neutral-700 mb-1">Aggiungi prodotto ({preventivo.brand.nome})</h2>
      <p className="text-xs text-neutral-400 mb-3">
        Scegli il modello e inserisci la misura reale: il prezzo viene calcolato in automatico dalla fascia di listino corrispondente.
      </p>

      <form action={aggiungiRigaPreventivoPerMisura} className="bg-white rounded-lg border border-neutral-200 p-4 flex flex-wrap items-end gap-2 mb-6">
        <input type="hidden" name="preventivoId" value={preventivo.id} />
        <input type="hidden" name="brandId" value={preventivo.brandId} />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Modello</label>
          <select name="tipologia" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm min-w-[240px]">
            <option value="">— seleziona —</option>
            {[...gruppiOrdinati.entries()].map(([chiave, tips]) => (
              <optgroup key={chiave} label={chiave}>
                {tips.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Larghezza</label>
          <input name="larghezza" type="number" step="0.1" min="0" required placeholder="es. 380" className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-28" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Altezza / sporgenza</label>
          <input name="altezza" type="number" step="0.1" min="0" required placeholder="es. 250" className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-28" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Quantità</label>
          <input name="quantita" type="number" defaultValue={1} min={1} className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-20" />
        </div>
        <button className="btn-3d text-sm px-4 py-2" style={{ background: info.primary, color: "#fff", borderColor: info.primary }}>
          Calcola e aggiungi
        </button>
        <p className="text-[11px] text-neutral-400 w-full">
          Unità di misura secondo il listino del modello scelto (cm per le strutture outdoor, mm per i serramenti). Il sistema arrotonda per eccesso alla fascia di listino più vicina.
        </p>
      </form>

      <details className="mb-6">
        <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-700">
          Ricerca avanzata — sfoglia tutte le combinazioni di misura del listino
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
