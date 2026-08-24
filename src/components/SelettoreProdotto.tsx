"use client";

import { useMemo, useState, type FormEvent } from "react";
import { unitaMisura } from "@/lib/prodotti";

export type NodoTipologia = {
  value: string;
  label: string;
  haMisura: boolean;
  varianti?: { id: string; colore: string; prezzoBase: number }[];
  // range di misure effettivamente a listino (solo per i modelli con haMisura=true)
  misure?: { larghezzaMin: number; larghezzaMax: number; altezzaMin: number; altezzaMax: number };
};
export type GruppoNodo = { nome: string; tipologie: NodoTipologia[] };
export type FamigliaNodo = { nome: string; gruppi: GruppoNodo[] };

export default function SelettoreProdotto({
  preventivoId,
  brandId,
  brandColor,
  tassonomia,
  azionePerMisura,
  azionePerProdotto,
}: {
  preventivoId: string;
  brandId: string;
  brandColor: string;
  tassonomia: FamigliaNodo[];
  azionePerMisura: (formData: FormData) => void;
  azionePerProdotto: (formData: FormData) => void;
}) {
  const [query, setQuery] = useState("");
  const [famigliaAperta, setFamigliaAperta] = useState<string | null>(null);
  const [gruppoAperto, setGruppoAperto] = useState<string | null>(null);
  const [scelto, setScelto] = useState<NodoTipologia | null>(null);
  const [larghezzaVal, setLarghezzaVal] = useState("");
  const [altezzaVal, setAltezzaVal] = useState("");
  const [erroreMisura, setErroreMisura] = useState<string | null>(null);

  const risultatiRicerca = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const out: { famiglia: string; gruppo: string; nodo: NodoTipologia }[] = [];
    for (const f of tassonomia) {
      for (const g of f.gruppi) {
        for (const t of g.tipologie) {
          if (t.label.toLowerCase().includes(q) || t.value.toLowerCase().includes(q)) {
            out.push({ famiglia: f.nome, gruppo: g.nome, nodo: t });
          }
        }
      }
    }
    return out;
  }, [query, tassonomia]);

  function scegli(nodo: NodoTipologia) {
    setScelto(nodo);
    setLarghezzaVal("");
    setAltezzaVal("");
    setErroreMisura(null);
  }

  function azzeraScelta() {
    setScelto(null);
    setLarghezzaVal("");
    setAltezzaVal("");
    setErroreMisura(null);
  }

  // controlla che la misura inserita sia un numero valido e rientri nel range di produzione
  // del modello scelto; restituisce il messaggio di errore da mostrare, o null se tutto ok
  function controllaMisure(nodo: NodoTipologia, larghezzaStr: string, altezzaStr: string): string | null {
    const larghezza = parseFloat(larghezzaStr.replace(",", "."));
    const altezza = parseFloat(altezzaStr.replace(",", "."));
    if (!larghezzaStr.trim() || !altezzaStr.trim() || !Number.isFinite(larghezza) || !Number.isFinite(altezza)) {
      return "Misura non valida: inserisci solo numeri per larghezza e altezza.";
    }
    if (larghezza <= 0 || altezza <= 0) {
      return "Misura non valida: i valori devono essere maggiori di zero.";
    }
    const unit = unitaMisura(nodo.value);
    if (nodo.misure) {
      const { larghezzaMin, larghezzaMax, altezzaMin, altezzaMax } = nodo.misure;
      if (larghezza < larghezzaMin || larghezza > larghezzaMax) {
        return `Larghezza fuori produzione: per questo modello va da ${larghezzaMin} a ${larghezzaMax} ${unit}.`;
      }
      if (altezza < altezzaMin || altezza > altezzaMax) {
        return `Altezza/sporgenza fuori produzione: per questo modello va da ${altezzaMin} a ${altezzaMax} ${unit}.`;
      }
    }
    return null;
  }

  function alSubmitMisura(e: FormEvent<HTMLFormElement>) {
    if (!scelto) return;
    const errore = controllaMisure(scelto, larghezzaVal, altezzaVal);
    setErroreMisura(errore);
    if (errore) e.preventDefault();
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
      <h2 className="text-sm font-medium text-neutral-700 mb-1">Aggiungi prodotto</h2>
      <p className="text-xs text-neutral-400 mb-3">
        Sfoglia Indoor / Outdoor per famiglia e modello, oppure cerca direttamente il nome se lo conosci già.
      </p>

      <div className="relative mb-3">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-300 text-sm">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca modello per nome..."
          className="w-full border border-neutral-200 rounded px-2 py-1.5 pl-8 text-sm"
        />
      </div>

      {risultatiRicerca ? (
        <div className="border border-neutral-100 rounded-lg divide-y divide-neutral-50 max-h-72 overflow-y-auto mb-3">
          {risultatiRicerca.length === 0 && (
            <p className="px-3 py-3 text-sm text-neutral-400">Nessun modello corrisponde a &quot;{query}&quot;.</p>
          )}
          {risultatiRicerca.map(({ famiglia, gruppo, nodo }) => (
            <button
              key={nodo.value}
              type="button"
              onClick={() => scegli(nodo)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 ${scelto?.value === nodo.value ? "bg-neutral-50" : ""}`}
            >
              <span className="font-medium">{nodo.label}</span>
              <span className="block text-[11px] text-neutral-400">{famiglia} · {gruppo}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="border border-neutral-100 rounded-lg divide-y divide-neutral-50 mb-3">
          {tassonomia.map((f) => {
            const apertaF = famigliaAperta === f.nome;
            return (
              <div key={f.nome}>
                <button
                  type="button"
                  onClick={() => {
                    setFamigliaAperta(apertaF ? null : f.nome);
                    setGruppoAperto(null);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <span>{f.nome === "INDOOR" ? "🏠 Indoor" : f.nome === "OUTDOOR" ? "🌤️ Outdoor" : f.nome}</span>
                  <span className="text-neutral-300 text-xs">{apertaF ? "▲" : "▼"}</span>
                </button>
                {apertaF && (
                  <div className="pl-3 pb-1">
                    {f.gruppi.map((g) => {
                      const apertoG = gruppoAperto === g.nome;
                      return (
                        <div key={g.nome} className="border-t border-neutral-50 first:border-t-0">
                          <button
                            type="button"
                            onClick={() => setGruppoAperto(apertoG ? null : g.nome)}
                            className="w-full flex items-center justify-between px-2 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                          >
                            <span>{g.nome} <span className="text-neutral-300 font-normal">({g.tipologie.length})</span></span>
                            <span className="text-neutral-300">{apertoG ? "▲" : "▼"}</span>
                          </button>
                          {apertoG && (
                            <div className="pl-3 pb-1 flex flex-col">
                              {g.tipologie.map((t) => (
                                <button
                                  key={t.value}
                                  type="button"
                                  onClick={() => scegli(t)}
                                  className={`text-left px-2 py-1.5 text-xs rounded hover:bg-neutral-50 ${scelto?.value === t.value ? "bg-neutral-100 font-medium" : "text-neutral-500"}`}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {scelto && (
        <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">{scelto.label}</p>
            <button type="button" onClick={azzeraScelta} className="text-xs text-neutral-400 hover:text-neutral-700">✕ cambia modello</button>
          </div>

          {scelto.haMisura ? (
            <>
              {scelto.misure && (
                <p className="text-xs mb-2">
                  <span className="font-bold text-neutral-700">
                    Misure di produzione: larghezza {scelto.misure.larghezzaMin}–{scelto.misure.larghezzaMax} {unitaMisura(scelto.value)}
                    {" "}· altezza/sporgenza {scelto.misure.altezzaMin}–{scelto.misure.altezzaMax} {unitaMisura(scelto.value)}
                  </span>
                </p>
              )}
              <form action={azionePerMisura} onSubmit={alSubmitMisura} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="preventivoId" value={preventivoId} />
                <input type="hidden" name="brandId" value={brandId} />
                <input type="hidden" name="tipologia" value={scelto.value} />
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-500">Larghezza ({unitaMisura(scelto.value)})</label>
                  <input
                    name="larghezza"
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    placeholder="es. 380"
                    value={larghezzaVal}
                    onChange={(e) => {
                      setLarghezzaVal(e.target.value);
                      if (erroreMisura) setErroreMisura(null);
                    }}
                    className={`border rounded px-2 py-1.5 text-sm w-28 ${erroreMisura ? "border-red-300" : "border-neutral-200"}`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-500">Altezza / sporgenza ({unitaMisura(scelto.value)})</label>
                  <input
                    name="altezza"
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    placeholder="es. 250"
                    value={altezzaVal}
                    onChange={(e) => {
                      setAltezzaVal(e.target.value);
                      if (erroreMisura) setErroreMisura(null);
                    }}
                    className={`border rounded px-2 py-1.5 text-sm w-28 ${erroreMisura ? "border-red-300" : "border-neutral-200"}`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-500">Quantità</label>
                  <input name="quantita" type="number" defaultValue={1} min={1} className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-20" />
                </div>
                <button className="btn-3d text-sm px-4 py-2" style={{ background: brandColor, color: "#fff", borderColor: brandColor }}>
                  Calcola e aggiungi
                </button>
                {erroreMisura && (
                  <div className="w-full flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs font-medium">
                    <span>⚠️</span>
                    <span>{erroreMisura}</span>
                  </div>
                )}
                <p className="text-[11px] text-neutral-400 w-full">
                  Il prezzo viene calcolato dalla fascia di listino più vicina alla misura inserita.
                </p>
              </form>
            </>
          ) : scelto.varianti && scelto.varianti.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] text-neutral-400 mb-1">Prodotto a prezzo fisso (senza misura) — scegli la variante:</p>
              {scelto.varianti.map((v) => (
                <form key={v.id} action={azionePerProdotto} className="flex items-center justify-between gap-2 bg-white border border-neutral-200 rounded px-2 py-1.5">
                  <input type="hidden" name="preventivoId" value={preventivoId} />
                  <input type="hidden" name="prodottoId" value={v.id} />
                  <span className="text-xs flex-1">{v.colore} — {v.prezzoBase.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
                  <input name="quantita" type="number" defaultValue={1} min={1} className="border border-neutral-200 rounded px-1.5 py-1 text-xs w-16" />
                  <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ aggiungi</button>
                </form>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400">Nessuna variante disponibile a listino per questo modello.</p>
          )}
        </div>
      )}
    </div>
  );
}
