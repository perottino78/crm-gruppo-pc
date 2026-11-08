"use client";

import { useEffect, useState } from "react";
import type { RisultatoComplemento } from "@/app/api/complementi/route";
import type { Complemento } from "@/app/commesse-actions";

const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";
export type MaterialeInLista = Complemento & { etichetta: string };

/**
 * Cerca il materiale nel listino o negli articoli (o scrivilo a mano) e mettilo nella lista del rilievo.
 * Non salva niente da solo: i campi non hanno «name», la lista si salva con il rilievo.
 */
export default function ScegliMateriale({ fornitori, onAggiungi }: { fornitori: { id: string; ragioneSociale: string }[]; onAggiungi: (m: MaterialeInLista) => void }) {
  const [q, setQ] = useState("");
  const [risultati, setRisultati] = useState<RisultatoComplemento[]>([]);
  const [cerca, setCerca] = useState(false);
  const [scelto, setScelto] = useState<RisultatoComplemento | null>(null);
  const [colore, setColore] = useState(""), [L, setL] = useState(""), [H, setH] = useState(""), [quantita, setQuantita] = useState("1");
  const [fornitoreId, setFornitoreId] = useState(""), [note, setNote] = useState("");
  const [errore, setErrore] = useState<string | null>(null);

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
    setScelto(r); setFornitoreId(r.fornitoreId ?? ""); setRisultati([]); setErrore(null);
    setColore(r.tipo === "P" ? r.colori[0] ?? "" : "");
  }
  function azzera() { setScelto(null); setQ(""); setFornitoreId(""); setColore(""); setL(""); setH(""); setQuantita("1"); setNote(""); setErrore(null); }

  function aggiungi() {
    const forn = fornitori.find((f) => f.id === fornitoreId)?.ragioneSociale;
    const qta = quantita.trim() || "1";
    if (!scelto) {
      if (!q.trim()) { setErrore("Cerca un prodotto o scrivi la descrizione."); return; }
      onAggiungi({ tipo: "T", descrizione: q.trim(), quantita: qta, fornitoreId: fornitoreId || null, note: note || null, etichetta: `${q.trim()} × ${qta}${forn ? ` · ${forn}` : ""}` });
    } else if (scelto.tipo === "A") {
      const nome = scelto.label.split(" — ").slice(1).join(" — ") || scelto.label;
      onAggiungi({ tipo: "A", articoloId: scelto.id, descrizione: nome, quantita: qta, fornitoreId: fornitoreId || null, note: note || null, etichetta: `${scelto.label} × ${qta}${forn ? ` · ${forn}` : scelto.fornitore ? ` · ${scelto.fornitore}` : ""}` });
    } else {
      if (scelto.griglia && !L.trim()) { setErrore(`Scrivi la misura (${scelto.unita}).`); return; }
      const misura = scelto.griglia ? ` ${L}${H ? `×${H}` : ""} ${scelto.unita}` : "";
      onAggiungi({ tipo: "P", brandId: scelto.brandId, tipologia: scelto.tipologia, colore, larghezza: L || null, altezza: H || null, descrizione: scelto.label, quantita: qta, fornitoreId: fornitoreId || null, note: note || null,
        etichetta: `${scelto.label} — ${colore}${misura} × ${qta}${forn ? ` · ${forn}` : ""}` });
    }
    azzera();
  }

  return (
    <div className="space-y-2 rounded border border-teal-200 bg-teal-50/40 p-2">
      {!scelto ? (
        <div className="relative">
          <label className="text-xs font-bold text-neutral-800 block">Cerca nel listino o negli articoli, oppure scrivi la descrizione</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } }} autoComplete="off"
            placeholder="es. scossalina, coprifilo, zanzariera, silicone…" className={`${inp} w-full`} />
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
          <button type="button" onClick={azzera} className="text-xs text-blue-800 underline">cambia</button>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {scelto?.tipo === "P" && (
          <>
            <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">Colore / variante
              <select value={colore} onChange={(e) => setColore(e.target.value)} className={`${inp} max-w-72`}>{scelto.colori.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            {scelto.griglia && (
              <>
                <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">L ({scelto.unita})<input value={L} onChange={(e) => setL(e.target.value)} inputMode="decimal" className={`${inp} w-24`} /></label>
                <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">H ({scelto.unita})<input value={H} onChange={(e) => setH(e.target.value)} inputMode="decimal" className={`${inp} w-24`} /></label>
              </>
            )}
          </>
        )}
        <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">Quantità<input value={quantita} onChange={(e) => setQuantita(e.target.value)} inputMode="numeric" className={`${inp} w-20`} /></label>
        <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">Fornitore
          <select value={fornitoreId} onChange={(e) => setFornitoreId(e.target.value)} className={`${inp} max-w-60`}>
            <option value="">{scelto ? "quello del listino" : "da scegliere…"}</option>
            {fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">Note<input value={note} onChange={(e) => setNote(e.target.value)} className={`${inp} w-48`} /></label>
        <button type="button" onClick={aggiungi} className="btn-3d btn-3d-teal text-sm px-3 py-1.5">➕ Aggiungi alla lista</button>
      </div>
      {errore && <p className="text-xs text-red-800">{errore}</p>}
    </div>
  );
}
