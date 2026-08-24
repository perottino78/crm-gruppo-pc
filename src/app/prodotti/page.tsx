export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import BrandSwitcher from "@/components/BrandSwitcher";
import { unitaMisura, haMisura } from "@/lib/prodotti";
import { trovaFasciaPrezzo } from "@/lib/prezzoPerMisura";

export default async function ProdottiPage({
  searchParams,
}: {
  searchParams: Promise<{
    brand?: string;
    q?: string;
    famiglia?: string;
    gruppo?: string;
    calcTipologia?: string;
    calcLarghezza?: string;
    calcAltezza?: string;
  }>;
}) {
  const { brand, q, famiglia, gruppo, calcTipologia, calcLarghezza, calcAltezza } = await searchParams;
  const brandFiltro = brand && brand !== "Tutti" ? { brand: { nome: brand } } : {};

  const modelli = await prisma.modelloProdotto.findMany({
    where: brand && brand !== "Tutti" ? { brand: { nome: brand } } : {},
  });
  const modelloMap = new Map(modelli.map((m) => [m.tipologia, m]));

  const famiglieDisponibili = [...new Set(modelli.map((m) => m.famiglia).filter((f): f is string => !!f))].sort();
  const gruppiDisponibili = [...new Set(modelli.filter((m) => !famiglia || m.famiglia === famiglia).map((m) => m.gruppo).filter((g): g is string => !!g))].sort();

  const raggruppati = await prisma.prodotto.groupBy({
    by: ["tipologia"],
    where: brandFiltro,
    _count: { _all: true },
    _min: { prezzoBase: true, larghezzaMm: true, altezzaMm: true },
    _max: { prezzoBase: true, larghezzaMm: true, altezzaMm: true },
  });

  let modelliRiga = raggruppati.map((g) => ({
    tipologia: g.tipologia,
    varianti: g._count._all,
    prezzoMin: g._min.prezzoBase ?? 0,
    prezzoMax: g._max.prezzoBase ?? 0,
    larghezzaMin: g._min.larghezzaMm ?? 0,
    larghezzaMax: g._max.larghezzaMm ?? 0,
    altezzaMin: g._min.altezzaMm ?? 0,
    altezzaMax: g._max.altezzaMm ?? 0,
    modello: modelloMap.get(g.tipologia),
  }));

  const tutteLeTipologie = [...modelliRiga].sort((a, b) => a.tipologia.localeCompare(b.tipologia)).map((r) => r.tipologia);

  // con una ricerca libera si va dritti ai risultati in tutte le famiglie/gruppi (scorciatoia
  // per chi conosce già il nome); senza ricerca si segue la navigazione a tendina Famiglia > Gruppo
  const cercaLibera = !!q;
  if (!cercaLibera) {
    if (famiglia) modelliRiga = modelliRiga.filter((r) => r.modello?.famiglia === famiglia);
    if (gruppo) modelliRiga = modelliRiga.filter((r) => r.modello?.gruppo === gruppo);
  } else {
    const ql = q.toLowerCase();
    modelliRiga = modelliRiga.filter(
      (r) => r.tipologia.toLowerCase().includes(ql) || r.modello?.descrizioneTecnica?.toLowerCase().includes(ql)
    );
  }
  modelliRiga.sort((a, b) => a.tipologia.localeCompare(b.tipologia));

  const mostraFamiglie = !cercaLibera && !famiglia;
  const mostraGruppi = !cercaLibera && !!famiglia && !gruppo;
  const mostraTabella = cercaLibera || (!!famiglia && !!gruppo);

  const conteggioPerFamiglia = new Map<string, number>();
  const conteggioPerGruppo = new Map<string, number>();
  for (const r of raggruppati) {
    const m = modelloMap.get(r.tipologia);
    const f = m?.famiglia ?? "Altro";
    conteggioPerFamiglia.set(f, (conteggioPerFamiglia.get(f) ?? 0) + 1);
    if (m?.famiglia && m?.gruppo) {
      const chiave = `${m.famiglia}|${m.gruppo}`;
      conteggioPerGruppo.set(chiave, (conteggioPerGruppo.get(chiave) ?? 0) + 1);
    }
  }
  const iconaFamiglia = (f: string) => (f === "INDOOR" ? "🏠" : f === "OUTDOOR" ? "🌤️" : "📦");

  const totaleCombinazioni = modelliRiga.reduce((s, r) => s + r.varianti, 0);
  const totaleModelli = await prisma.prodotto.groupBy({ by: ["tipologia"], _count: { _all: true } });

  let calcRisultato: { prezzo: number; larghezzaFascia: number; altezzaFascia: number; unit: string } | null = null;
  let calcErrore: string | null = null;
  if (calcTipologia && calcLarghezza && calcAltezza) {
    if (!brand || brand === "Tutti") {
      calcErrore = "Seleziona prima un'azienda (in alto) per calcolare un prezzo.";
    } else {
      const brandRow = await prisma.brand.findUnique({ where: { nome: brand } });
      const larghezzaNum = parseFloat(calcLarghezza.replace(",", "."));
      const altezzaNum = parseFloat(calcAltezza.replace(",", "."));
      if (brandRow && Number.isFinite(larghezzaNum) && Number.isFinite(altezzaNum)) {
        const trovato = await trovaFasciaPrezzo({ brandId: brandRow.id, tipologia: calcTipologia, larghezza: larghezzaNum, altezza: altezzaNum });
        if (trovato) {
          calcRisultato = { prezzo: trovato.prezzoBase, larghezzaFascia: trovato.larghezzaMm, altezzaFascia: trovato.altezzaMm, unit: unitaMisura(calcTipologia) };
        } else {
          calcErrore = "Nessuna fascia di prezzo disponibile per questa misura in questo listino.";
        }
      }
    }
  }

  const qs = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (brand) params.set("brand", brand);
    if (q) params.set("q", q);
    if (famiglia) params.set("famiglia", famiglia);
    if (gruppo) params.set("gruppo", gruppo);
    Object.entries(overrides).forEach(([k, v]) => (v ? params.set(k, v) : params.delete(k)));
    return `?${params.toString()}`;
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Prodotti &amp; listini</h1>
        <BrandSwitcher active={brand ?? "Tutti"} />
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <p className="text-sm text-neutral-600">
          <span className="font-medium">{totaleModelli.length}</span> modelli a listino,{" "}
          <span className="font-medium">{totaleCombinazioni}</span> combinazioni di misura nelle fasce di prezzo — tenute nascoste:
          scegli il modello e inserisci la misura per ottenere il prezzo.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <h2 className="text-sm font-medium text-neutral-700 mb-1">Calcola prezzo per misura</h2>
        <p className="text-xs text-neutral-400 mb-3">Seleziona il modello, digita la misura reale: il prezzo esce dalla fascia di listino nascosta.</p>
        <form className="flex flex-wrap items-end gap-2" action="/prodotti" method="get">
          {brand && <input type="hidden" name="brand" value={brand} />}
          {q && <input type="hidden" name="q" value={q} />}
          {famiglia && <input type="hidden" name="famiglia" value={famiglia} />}
          {gruppo && <input type="hidden" name="gruppo" value={gruppo} />}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500">Modello</label>
            <select name="calcTipologia" defaultValue={calcTipologia ?? ""} className="border border-neutral-200 rounded px-2 py-1.5 text-sm min-w-[220px]">
              <option value="">— seleziona —</option>
              {tutteLeTipologie.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500">Larghezza</label>
            <input name="calcLarghezza" type="number" step="0.1" defaultValue={calcLarghezza ?? ""} className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-28" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500">Altezza / sporgenza</label>
            <input name="calcAltezza" type="number" step="0.1" defaultValue={calcAltezza ?? ""} className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-28" />
          </div>
          <button className="btn-3d btn-3d-orange text-sm px-4 py-2">Vedi prezzo</button>
        </form>
        {calcRisultato && (
          <div className="mt-3 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-green-800">
            Prezzo: <span className="font-semibold">{calcRisultato.prezzo.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>{" "}
            <span className="text-green-600 text-xs">(fascia listino {calcRisultato.larghezzaFascia}×{calcRisultato.altezzaFascia}{calcRisultato.unit})</span>
          </div>
        )}
        {calcErrore && (
          <div className="mt-3 text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-amber-800">{calcErrore}</div>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-2 mb-6" action="/prodotti" method="get">
        {brand && <input type="hidden" name="brand" value={brand} />}
        {famiglia && <input type="hidden" name="famiglia" value={famiglia} />}
        {gruppo && <input type="hidden" name="gruppo" value={gruppo} />}
        <div className="flex flex-col gap-1 flex-1 max-w-sm">
          <label className="text-xs text-neutral-500">🔍 Cerca modello per nome (scorciatoia, salta la navigazione)</label>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="nome modello o descrizione..."
            className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-full"
          />
        </div>
        <button className="btn-3d btn-3d-dark text-sm px-4 py-2">Cerca</button>
        {q && (
          <Link href={qs({ q: undefined })} className="text-xs text-neutral-400 underline mb-2">
            azzera ricerca
          </Link>
        )}
      </form>

      {mostraFamiglie && (
        <div>
          <p className="text-xs text-neutral-400 mb-2">Sfoglia per sezione:</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {famiglieDisponibili.map((f) => (
              <Link
                key={f}
                href={qs({ famiglia: f, gruppo: undefined })}
                className="bg-white rounded-lg border border-neutral-200 p-4 hover:border-neutral-400 transition-colors"
              >
                <span className="text-2xl">{iconaFamiglia(f)}</span>
                <p className="text-sm font-medium mt-1">{f === "INDOOR" ? "Indoor" : f === "OUTDOOR" ? "Outdoor" : f}</p>
                <p className="text-xs text-neutral-400">{conteggioPerFamiglia.get(f) ?? 0} modelli</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {mostraGruppi && (
        <div>
          <Link href={qs({ famiglia: undefined, gruppo: undefined })} className="text-xs text-neutral-400 hover:underline mb-2 inline-block">
            ← {iconaFamiglia(famiglia!)} {famiglia === "INDOOR" ? "Indoor" : famiglia === "OUTDOOR" ? "Outdoor" : famiglia}
          </Link>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {gruppiDisponibili.map((g) => (
              <Link
                key={g}
                href={qs({ gruppo: g })}
                className="bg-white rounded-lg border border-neutral-200 p-4 hover:border-neutral-400 transition-colors"
              >
                <p className="text-sm font-medium">{g}</p>
                <p className="text-xs text-neutral-400">{conteggioPerGruppo.get(`${famiglia}|${g}`) ?? 0} modelli</p>
              </Link>
            ))}
            {gruppiDisponibili.length === 0 && (
              <p className="text-sm text-neutral-400 col-span-2">Nessun gruppo trovato per questa famiglia.</p>
            )}
          </div>
        </div>
      )}

      {mostraTabella && (
      <>
      {cercaLibera ? (
        <p className="text-xs text-neutral-400 mb-2">
          Risultati per &quot;{q}&quot; in tutte le sezioni ({modelliRiga.length})
        </p>
      ) : (
        <div className="flex items-center gap-1 text-xs text-neutral-400 mb-2">
          <Link href={qs({ famiglia: undefined, gruppo: undefined })} className="hover:underline">
            {iconaFamiglia(famiglia!)} {famiglia === "INDOOR" ? "Indoor" : famiglia === "OUTDOOR" ? "Outdoor" : famiglia}
          </Link>
          <span>/</span>
          <Link href={qs({ gruppo: undefined })} className="hover:underline font-medium text-neutral-600">
            {gruppo}
          </Link>
        </div>
      )}

      <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-400 border-b border-neutral-100">
              <th className="px-4 py-2 font-medium"></th>
              <th className="px-4 py-2 font-medium">Modello</th>
              <th className="px-4 py-2 font-medium">Famiglia / gruppo</th>
              <th className="px-4 py-2 font-medium">Range misure</th>
              <th className="px-4 py-2 font-medium text-right">Prezzo (da / a)</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {modelliRiga.map((r) => {
              const unit = unitaMisura(r.tipologia);
              return (
                <tr key={r.tipologia}>
                  <td className="px-4 py-2">
                    {r.modello?.immagineUrl ? (
                      <img src={r.modello.immagineUrl} alt={r.tipologia} className="w-10 h-10 object-cover rounded border border-neutral-200" />
                    ) : (
                      <span className="w-10 h-10 block rounded bg-neutral-50 border border-dashed border-neutral-200" />
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    {r.tipologia.replace(/_/g, " ")}
                    <span className="block text-xs text-neutral-400 font-normal">{r.varianti} misure a listino</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500 text-xs">
                    {r.modello?.famiglia ? `${r.modello.famiglia} · ${r.modello.gruppo ?? ""}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-500 text-xs">
                    {haMisura(r.larghezzaMax, r.altezzaMax)
                      ? `${r.larghezzaMin}–${r.larghezzaMax} × ${r.altezzaMin}–${r.altezzaMax} ${unit}`
                      : "prezzo fisso (senza misura)"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.prezzoMin.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                    {r.prezzoMax !== r.prezzoMin && <> – {r.prezzoMax.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/prodotti/modello/${encodeURIComponent(r.tipologia)}`} className="text-xs text-blue-600 underline whitespace-nowrap">
                      scheda tecnica
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {modelliRiga.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-400">Nessun modello corrisponde ai filtri.</p>
        )}
      </div>
      </>
      )}
    </div>
  );
}
