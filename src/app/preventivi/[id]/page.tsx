export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { brandInfo } from "@/lib/brands";
import { unitaMisura, listinoDiTipologia } from "@/lib/prodotti";
import {
  aggiungiRigaPreventivo,
  rimuoviRigaPreventivo,
  aggiungiOptionalARiga,
  rimuoviOptionalDaRiga,
  aggiornaStatoPreventivo,
  toggleDescrizioneRiga,
} from "@/app/actions";

const STATI = ["APERTO", "ACCETTATO", "SCADUTO", "ANNULLATO"];

export default async function PreventivoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;

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

  const [optionaliDisponibili, prodottiTrovati] = await Promise.all([
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
  ]);

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
            className="text-sm border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50"
          >
            🖨️ Stampa offerta
          </Link>
        </div>
      </div>

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
            <button className="text-xs text-blue-600 underline">salva</button>
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
          return (
            <div key={r.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {modello?.immagineUrl && (
                    <img src={modello.immagineUrl} alt={r.prodotto.tipologia} className="w-12 h-12 object-cover rounded border border-neutral-200" />
                  )}
                  <div>
                    <p className="font-medium">{r.prodotto.tipologia} · {r.prodotto.colore} · {r.prodotto.larghezzaMm}×{r.prodotto.altezzaMm}{unitaMisura(r.prodotto.tipologia)}</p>
                    <p className="text-xs text-neutral-400">{r.quantita} × {r.prezzoUnitario.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{subtotale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
                  <form action={rimuoviRigaPreventivo}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="preventivoId" value={preventivo.id} />
                    <button className="text-xs text-red-400 hover:text-red-600">rimuovi</button>
                  </form>
                </div>
              </div>

              {modello?.descrizioneTecnica && (
                <form action={toggleDescrizioneRiga} className="mt-1.5 flex items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="preventivoId" value={preventivo.id} />
                  <input type="hidden" name="mostra" value={(!r.mostraDescrizione).toString()} />
                  <button className={`text-[11px] px-2 py-0.5 rounded-full border ${r.mostraDescrizione ? "border-green-200 bg-green-50 text-green-700" : "border-neutral-200 text-neutral-400"}`}>
                    {r.mostraDescrizione ? "✓ descrizione visibile in offerta" : "descrizione nascosta — clicca per mostrarla"}
                  </button>
                </form>
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
                <button className="text-xs text-blue-600 underline">+ optional</button>
              </form>
            </div>
          );
        })}
        {preventivo.righe.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-400">Nessun prodotto ancora — cercalo qui sotto.</p>
        )}
      </div>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">Aggiungi prodotto ({preventivo.brand.nome})</h2>
      <form className="flex items-end gap-2 mb-4" action={`/preventivi/${preventivo.id}`} method="get">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-neutral-500">Cerca tipologia o colore</label>
          <input name="q" defaultValue={q ?? ""} placeholder="es. FF1, LUCILLA_PARETE..." className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-full" />
        </div>
        <button className="bg-neutral-900 text-white text-sm rounded px-3 py-1.5">Cerca</button>
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
              <span className="flex-1">{p.tipologia} · {p.colore} · {p.larghezzaMm}×{p.altezzaMm}{unitaMisura(p.tipologia)}</span>
              <input name="quantita" type="number" defaultValue={1} min={1} className="border border-neutral-200 rounded px-1.5 py-1 text-xs w-14" />
              <input
                name="prezzoUnitario"
                type="number"
                step="0.01"
                defaultValue={p.prezzoBase}
                className="border border-neutral-200 rounded px-1.5 py-1 text-xs w-24"
              />
              <button className="text-xs bg-neutral-900 text-white rounded px-2 py-1">+ aggiungi</button>
            </form>
          ))}
        </div>
      )}
      {q && prodottiTrovati.length === 0 && (
        <p className="text-sm text-neutral-400">Nessun prodotto trovato per &quot;{q}&quot; nel brand {preventivo.brand.nome}.</p>
      )}
    </div>
  );
}
