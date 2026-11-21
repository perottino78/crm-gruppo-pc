"use client";

// Verbale di sopralluogo al «Carica rilievo»: le sezioni del modulo cartaceo a fisarmonica (si apre, si spunta, si chiude) e la tabella dei prodotti da installare.
import { useEffect, useState } from "react";
import { SEZIONI_VERBALE, MAX_RIGHE_PRODOTTI, riassuntoSezione, type Verbale, type RigaProdotto } from "@/lib/rilievo/verbale";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm w-full";

export default function VerbaleCompilazione({ iniziale, chiaveBozza, salvato = false }: { iniziale: Verbale; chiaveBozza?: string; salvato?: boolean }) {
  const [campi, setCampi] = useState<Record<string, string | string[]>>(iniziale.campi);
  const [righe, setRighe] = useState<RigaProdotto[]>(iniziale.righe.length ? iniziale.righe : [{ tipo: "", larg: "", alt: "", q: "", note: "" }]);
  const [aperta, setAperta] = useState<string | null>(SEZIONI_VERBALE[0].id);
  const [rif, setRif] = useState(iniziale.rif_interno ?? "");
  // bozza nel browser: quello che si è spuntato resta se la pagina si ricarica prima di salvare
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    try {
      if (chiaveBozza && !salvato) {
        const raw = localStorage.getItem(chiaveBozza);
        if (raw) {
          const b = JSON.parse(raw) as { campi?: Record<string, string | string[]>; righe?: RigaProdotto[]; rif?: string };
          if (b.campi && typeof b.campi === "object") setCampi(b.campi);
          if (Array.isArray(b.righe) && b.righe.length) setRighe(b.righe);
          if (typeof b.rif === "string") setRif(b.rif);
        }
      }
    } catch { /* si lavora senza bozza */ }
    setPronto(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!pronto || !chiaveBozza) return;
    try { localStorage.setItem(chiaveBozza, JSON.stringify({ campi, righe, rif })); } catch { /* pieno o bloccato */ }
  }, [campi, righe, rif, pronto, chiaveBozza]);
  const imposta = (k: string, v: string | string[]) => setCampi((c) => ({ ...c, [k]: v }));
  const cambiaRiga = (i: number, k: keyof RigaProdotto, v: string) => setRighe((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const sezioni = [...SEZIONI_VERBALE.slice(0, 4), { id: "prodotti", titolo: "6 — Riepilogo prodotti da installare", campi: [] }, SEZIONI_VERBALE[4]];
  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-neutral-800">Riferimento interno
        <input name="v_rif_interno" value={rif} onChange={(e) => setRif(e.target.value)} className={`${inp} max-w-xs`} placeholder="chi ha seguito il cantiere" />
      </label>
      {sezioni.map((s) => {
        const apertaS = aperta === s.id;
        const n = s.id === "prodotti" ? righe.filter((r) => r.tipo.trim()).length : riassuntoSezione(s as (typeof SEZIONI_VERBALE)[number], campi);
        return (
          <div key={s.id} className={`rounded-lg border ${apertaS ? "border-orange-300 bg-orange-50/30" : "border-neutral-200 bg-white"}`}>
            <button type="button" onClick={() => setAperta(apertaS ? null : s.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left" aria-expanded={apertaS}>
              <span className="text-sm font-bold text-neutral-900">{s.titolo}</span>
              <span className="flex items-center gap-2 text-xs">
                {n > 0 && <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-900">✓ {n}</span>}
                <span className="text-neutral-500">{apertaS ? "▲" : "▼"}</span>
              </span>
            </button>
            {/* i campi restano nella pagina anche a sezione chiusa, così si salvano tutti */}
            <div className={`space-y-3 px-3 pb-3 ${apertaS ? "" : "hidden"}`}>
              {s.id === "prodotti" ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-neutral-600">Parte dai prodotti venduti: scrivi larghezza, altezza e note tecniche di ognuno.</p>
                  {righe.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1.6rem_1fr_4.5rem_4.5rem_3rem] gap-1.5 items-start rounded border border-neutral-200 bg-white p-1.5 md:grid-cols-[1.6rem_2fr_5rem_5rem_3.5rem_2fr_auto]">
                      <span className="pt-2 text-xs text-neutral-500">{i + 1}</span>
                      <input name={`vr_${i + 1}_tipo`} value={r.tipo} onChange={(e) => cambiaRiga(i, "tipo", e.target.value)} placeholder="Tipo prodotto / posizione" className={inp} />
                      <input name={`vr_${i + 1}_larg`} value={r.larg} onChange={(e) => cambiaRiga(i, "larg", e.target.value)} placeholder="Larg." inputMode="decimal" className={inp} />
                      <input name={`vr_${i + 1}_alt`} value={r.alt} onChange={(e) => cambiaRiga(i, "alt", e.target.value)} placeholder="Alt." inputMode="decimal" className={inp} />
                      <input name={`vr_${i + 1}_q`} value={r.q} onChange={(e) => cambiaRiga(i, "q", e.target.value)} placeholder="Q." inputMode="numeric" className={inp} />
                      <input name={`vr_${i + 1}_note`} value={r.note} onChange={(e) => cambiaRiga(i, "note", e.target.value)} placeholder="Note tecniche" className={`${inp} col-span-4 md:col-span-1`} />
                      <button type="button" onClick={() => setRighe((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [{ tipo: "", larg: "", alt: "", q: "", note: "" }]))} className="text-xs text-red-700 underline pt-2" aria-label="togli riga">togli</button>
                    </div>
                  ))}
                  {righe.length < MAX_RIGHE_PRODOTTI && <button type="button" onClick={() => setRighe((x) => [...x, { tipo: "", larg: "", alt: "", q: "", note: "" }])} className="btn-3d btn-3d-outline text-xs px-3 py-1.5">➕ Aggiungi una riga</button>}
                </div>
              ) : (
                (s as (typeof SEZIONI_VERBALE)[number]).campi.map((c) => {
                  if (c.tipo === "spunte") {
                    const scelti = (campi[c.k] as string[] | undefined) ?? [];
                    return (
                      <fieldset key={c.k}>
                        <legend className="mb-1 text-xs font-bold text-neutral-800">{c.label}</legend>
                        <div className="flex flex-wrap gap-1.5">
                          {c.opzioni.map((o) => {
                            const on = scelti.includes(o);
                            return (
                              <label key={o} className={`cursor-pointer select-none rounded-full border px-3 py-1.5 text-sm ${on ? "border-orange-500 bg-orange-100 font-semibold text-orange-950" : "border-neutral-300 bg-white text-neutral-800"}`}>
                                <input type="checkbox" name={`v_${c.k}`} value={o} checked={on} onChange={(e) => imposta(c.k, e.target.checked ? [...scelti, o] : scelti.filter((x) => x !== o))} className="sr-only" />
                                {on ? "☑" : "☐"} {o}
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    );
                  }
                  return (
                    <label key={c.k} className="block text-xs font-bold text-neutral-800">{c.label}
                      {c.tipo === "area"
                        ? <textarea name={`v_${c.k}`} value={(campi[c.k] as string | undefined) ?? ""} onChange={(e) => imposta(c.k, e.target.value)} rows={4} className={inp} />
                        : <input name={`v_${c.k}`} value={(campi[c.k] as string | undefined) ?? ""} onChange={(e) => imposta(c.k, e.target.value)} className={inp} />}
                    </label>
                  );
                })
              )}
              <button type="button" onClick={() => { const i = sezioni.findIndex((x) => x.id === s.id); setAperta(sezioni[i + 1]?.id ?? null); }} className="btn-3d btn-3d-teal text-sm px-4 py-1.5">✓ Fatto, chiudi{sezioni[sezioni.findIndex((x) => x.id === s.id) + 1] ? " e vai alla prossima" : ""}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
