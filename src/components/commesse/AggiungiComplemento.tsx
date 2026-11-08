"use client";

import { useEffect, useState } from "react";
import { aggiungiComplemento } from "@/app/commesse-actions";
import type { RisultatoComplemento } from "@/app/api/complementi/route";

const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";

/** Complemento del rilievo: cerca nel listino o negli articoli, oppure scrivi a testo libero. Solo acquisto. */
export default function AggiungiComplemento({ commessaId, fornitori }: { commessaId: string; fornitori: { id: string; ragioneSociale: string }[] }) {
  const [q, setQ] = useState("");
  const [risultati, setRisultati] = useState<RisultatoComplemento[]>([]);
  const [cerca, setCerca] = useState(false);
  const [scelto, setScelto] = useState<RisultatoComplemento | null>(null);
  const [fornitoreId, setFornitoreId] = useState("");

  useEffect(() => {
    if (scelto || q.trim().length < 2) { setRisultati([]); return; }
    const t = setTimeout(async () => {
      setCerca(true);
      try {
        const r = await fetch(`/api/complementi?q=${encodeURIComponent(q)}`);
        setRisultati(r.ok ? (await r.json()).risultati : []);
      } finally { setCerca(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, scelto]);

  function scegli(r: RisultatoComplemento) {
    setScelto(r);
    setFornitoreId(r.fornitoreId ?? "");
    setRisultati([]);
  }
  function annulla() { setScelto(null); setQ(""); setFornitoreId(""); }

  return (
    <form action={aggiungiComplemento} className="space-y-2">
      <input type="hidden" name="commessaId" value={commessaId} />
      <input type="hidden" name="tipo" value={scelto ? scelto.tipo : "T"} />
      {scelto?.tipo === "A" && <input type="hidden" name="articoloId" value={scelto.id} />}
      {scelto?.tipo === "P" && <><input type="hidden" name="brandId" value={scelto.brandId} /><input type="hidden" name="tipologia" value={scelto.tipologia} /></>}

      {!scelto ? (
        <div className="relative">
          <label className="text-xs font-bold text-neutral-800 block">Cerca nel listino o negli articoli, oppure scrivi la descrizione</label>
          <input name="descrizione" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" placeholder="es. scossalina, coprifilo, zanzariera, silicone…" className={`${inp} w-full`} />
          {cerca && <p className="text-[11px] text-neutral-500 mt-0.5">Cerco…</p>}
          {risultati.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-auto bg-white border border-neutral-300 rounded shadow-lg text-sm">
              {risultati.map((r, i) => (
                <li key={i}>
                  <button type="button" onClick={() => scegli(r)} className="w-full text-left px-2 py-1.5 hover:bg-blue-50">
                    <span className={`text-[10px] font-bold mr-1.5 px-1 rounded ${r.tipo === "A" ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-900"}`}>{r.tipo === "A" ? "ARTICOLO" : "LISTINO"}</span>
                    {r.label}
                    <span className="text-xs text-neutral-500">{r.tipo === "A" ? `${r.fornitore ? ` · ${r.fornitore}` : ""}${r.costo !== null ? ` · costo ${r.costo.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}/${r.um}` : ""}` : `${r.gruppo ? ` · ${r.gruppo}` : ""} · ${r.colori.length} colori${r.griglia ? " · a misura" : ""}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-neutral-500 mt-0.5">Se non lo trovi, lascia il testo scritto: verrà aggiunto come riga libera.</p>
        </div>
      ) : (
        <div className="rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-sm flex flex-wrap items-center gap-2">
          <span className="font-semibold text-neutral-900">{scelto.label}</span>
          <button type="button" onClick={annulla} className="text-xs text-blue-800 underline">cambia</button>
          {scelto.tipo === "P" && <input type="hidden" name="descrizione" value={scelto.label} />}
          {scelto.tipo === "A" && <input type="hidden" name="descrizione" value={scelto.label.split(" — ").slice(1).join(" — ")} />}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        {scelto?.tipo === "P" && (
          <>
            <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">Colore / variante
              <select name="colore" required className={`${inp} max-w-72`}>{scelto.colori.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            {scelto.griglia && (
              <>
                <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">L ({scelto.unita})<input name="larghezza" required inputMode="decimal" className={`${inp} w-24`} /></label>
                <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">H ({scelto.unita})<input name="altezza" inputMode="decimal" className={`${inp} w-24`} /></label>
              </>
            )}
          </>
        )}
        <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">Quantità<input name="quantita" defaultValue="1" inputMode="numeric" className={`${inp} w-20`} /></label>
        <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">Fornitore
          <select name="fornitoreId" value={fornitoreId} onChange={(e) => setFornitoreId(e.target.value)} className={`${inp} max-w-60`}>
            <option value="">{scelto ? "quello del listino" : "da scegliere…"}</option>
            {fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">Note<input name="note" className={`${inp} w-48`} /></label>
        <button className="btn-3d btn-3d-teal text-sm px-4 py-2">Aggiungi complemento</button>
      </div>
    </form>
  );
}
