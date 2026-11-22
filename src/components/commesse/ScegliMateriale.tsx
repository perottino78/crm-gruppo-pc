"use client";

import { useEffect, useState } from "react";
import type { RisultatoComplemento } from "@/app/api/complementi/route";
import type { Complemento } from "@/app/commesse-actions";
import type { AlberoLeggero, VoceLeggera } from "@/app/api/listino/albero/route";
import ConfiguraAngolare from "@/components/ordini/ConfiguraAngolare";
import ConfiguraLegno from "@/components/ordini/ConfiguraLegno";

const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";
/** Una riga della lista: `base` = nome con colore e misura, `fornDefault` = fornitore del listino/articolo, `fuori` = altro da mostrare in coda (es. foto allegata). */
export type MaterialeInLista = Complemento & { etichetta: string; base: string; fornDefault?: string | null; fuori?: string | null };

/** L'etichetta della riga come si legge in lista: «nome × quantità · fornitore · altro». Si rifà ogni volta che la riga si modifica. */
export function etichettaMateriale(m: Pick<MaterialeInLista, "base" | "quantita" | "fornitoreId" | "fornDefault" | "fuori">, fornitori: { id: string; ragioneSociale: string }[]): string {
  const forn = fornitori.find((f) => f.id === m.fornitoreId)?.ragioneSociale ?? m.fornDefault;
  return `${m.base} × ${m.quantita ?? 1}${forn ? ` · ${forn}` : ""}${m.fuori ? ` · ${m.fuori}` : ""}`;
}

/**
 * Cerca il materiale nel listino o negli articoli (o scrivilo a mano) e mettilo nella lista del rilievo.
 * Non salva niente da solo: i campi non hanno «name», la lista si salva con il rilievo.
 */
export default function ScegliMateriale({ fornitori, onAggiungi, brandId, onSospeso }: { fornitori: { id: string; ragioneSociale: string }[]; onAggiungi: (m: MaterialeInLista) => void; brandId?: string; onSospeso?: (testo: string | null) => void }) {
  const [albero, setAlbero] = useState<AlberoLeggero | null>(null);
  const [apriAlbero, setApriAlbero] = useState(false);
  async function caricaAlbero() {
    setApriAlbero((v) => !v);
    if (albero || !brandId) return;
    try { const r = await fetch(`/api/listino/albero?brandId=${encodeURIComponent(brandId)}`); setAlbero(r.ok ? (await r.json()).albero : []); } catch { setAlbero([]); }
  }
  async function dalListino(tipologia: string) {
    if (!brandId) return;
    const r = await fetch(`/api/complementi?tipologia=${encodeURIComponent(tipologia)}&brandId=${encodeURIComponent(brandId)}`);
    const j = r.ok ? await r.json() : { risultati: [] };
    if (j.risultati?.[0]) { scegli(j.risultati[0]); setApriAlbero(false); } else setErrore("Prodotto non trovato nel listino.");
  }
  const [q, setQ] = useState("");
  const [risultati, setRisultati] = useState<RisultatoComplemento[]>([]);
  const [cerca, setCerca] = useState(false);
  const [scelto, setScelto] = useState<RisultatoComplemento | null>(null);
  const [colore, setColore] = useState(""), [L, setL] = useState(""), [H, setH] = useState(""), [quantita, setQuantita] = useState("1");
  const [fornitoreId, setFornitoreId] = useState(""), [note, setNote] = useState("");
  const [errore, setErrore] = useState<string | null>(null);

  // prodotto scelto o descrizione scritta ma NON ancora messo in lista: lo si dice a chi sta per cambiare passo o salvare
  useEffect(() => { onSospeso?.(scelto ? scelto.label : q.trim() ? q.trim() : null); }, [scelto, q, onSospeso]);

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
      onAggiungi({ tipo: "T", descrizione: q.trim(), quantita: qta, fornitoreId: fornitoreId || null, note: note || null, base: q.trim(), etichetta: `${q.trim()} × ${qta}${forn ? ` · ${forn}` : ""}` });
    } else if (scelto.tipo === "A") {
      const nome = scelto.label.split(" — ").slice(1).join(" — ") || scelto.label;
      onAggiungi({ tipo: "A", articoloId: scelto.id, descrizione: nome, quantita: qta, fornitoreId: fornitoreId || null, note: note || null, base: scelto.label, fornDefault: scelto.fornitore ?? null, etichetta: `${scelto.label} × ${qta}${forn ? ` · ${forn}` : scelto.fornitore ? ` · ${scelto.fornitore}` : ""}` });
    } else {
      if (scelto.griglia && !L.trim()) { setErrore(`Scrivi la misura (${scelto.unita}).`); return; }
      const misura = scelto.griglia ? ` ${L}${H ? `×${H}` : ""} ${scelto.unita}` : "";
      onAggiungi({ tipo: "P", brandId: scelto.brandId, tipologia: scelto.tipologia, colore, larghezza: L || null, altezza: H || null, descrizione: scelto.label, quantita: qta, fornitoreId: fornitoreId || null, note: note || null,
        base: `${scelto.label} — ${colore}${misura}`, etichetta: `${scelto.label} — ${colore}${misura} × ${qta}${forn ? ` · ${forn}` : ""}` });
    }
    azzera();
  }

  return (
    <div className="space-y-2 rounded border border-teal-200 bg-teal-50/40 p-2">
      {!scelto && brandId && (
        <div>
          <button type="button" onClick={caricaAlbero} className="btn-3d btn-3d-outline text-xs px-3 py-1.5">📂 Sfoglia il listino (Indoor / Outdoor → categoria → prodotto) {apriAlbero ? "▴" : "▾"}</button>
          {apriAlbero && (
            <div className="mt-1 max-h-80 overflow-auto rounded border border-neutral-300 bg-white p-2 text-sm">
              {albero === null && <p className="text-xs text-neutral-500">Carico il listino…</p>}
              {albero?.length === 0 && <p className="text-xs text-neutral-500">Listino non disponibile.</p>}
              {(albero && !albero.some((x) => x.nome === "OUTDOOR") ? [...albero, { nome: "OUTDOOR", gruppi: [] } as AlberoLeggero[number]] : albero)?.map((f) => (
                <details key={f.nome} className="mb-1">
                  <summary className="cursor-pointer font-bold">{f.nome}</summary>
                  <div className="ml-3">
                    {raggruppaSerramenti(f.gruppi).map((g) => (
                      "materiali" in g ? (
                        <details key="SERRAMENTI" className="mb-0.5">
                          <summary className="cursor-pointer font-semibold text-neutral-800">SERRAMENTI</summary>
                          <div className="ml-3"><SerramentiATendina materiali={g.materiali} scegli={dalListino} /></div>
                        </details>
                      ) : (
                      <details key={g.nome} className="mb-0.5">
                        <summary className="cursor-pointer font-semibold text-neutral-800">{g.nome}</summary>
                        <div className="ml-3">
                          <VociATendine voci={g.voci} scegli={dalListino} />
                          {g.sottogruppi.map((sg) => (
                            <details key={sg.nome}>
                              <summary className="cursor-pointer text-neutral-700">{sg.nome}</summary>
                              <div className="ml-3"><VociATendine voci={sg.voci} scegli={dalListino} /></div>
                            </details>
                          ))}
                        </div>
                      </details>
                      )
                    ))}
                    {f.nome === "OUTDOOR" && (
                      <>
                        <details className="mb-0.5">
                          <summary className="cursor-pointer font-semibold text-slate-900">🔩 ANGOLARI IN ALLUMINIO <span className="text-xs font-normal text-neutral-500">su misura (Il Mastro)</span></summary>
                          <div className="ml-3 mt-1 rounded border border-slate-300 bg-slate-50 p-2">
                            <ConfiguraAngolare prezzo="costo" testoPulsante="➕ Aggiungi alla lista" onScegli={(x, codice, descrizione, extra) => {
                              const forn = fornitori.find((f2) => f2.id === fornitoreId)?.ragioneSociale;
                              onAggiungi({ tipo: "ANG", codice, descrizione, quantita: String(x.pezzi), fornitoreId: fornitoreId || null, note: extra.nota || null, allegato: extra.allegato,
                                base: descrizione, fornDefault: "Il Mastro", fuori: extra.allegato ? `📎 ${extra.allegato.nome}` : null,
                                etichetta: `${descrizione} × ${x.pezzi}${forn ? ` · ${forn}` : " · Il Mastro"}${extra.allegato ? ` · 📎 ${extra.allegato.nome}` : ""}` });
                              setApriAlbero(false);
                            }} />
                          </div>
                        </details>
                        <details className="mb-0.5">
                          <summary className="cursor-pointer font-semibold text-amber-950">🪵 LEGNI PIALLATI <span className="text-xs font-normal text-neutral-500">su misura: spessore, larghezza, lunghezza libere</span></summary>
                          <div className="ml-3 mt-1 rounded border border-amber-300 bg-amber-50 p-2">
                            <ConfiguraLegno prezzo="costo" testoPulsante="➕ Aggiungi alla lista" onScegli={(x, codice, descrizione, nota) => {
                              const forn = fornitori.find((f2) => f2.id === fornitoreId)?.ragioneSociale;
                              onAggiungi({ tipo: "LEG", codice, descrizione, quantita: String(x.pezzi), fornitoreId: fornitoreId || null, note: nota || null, base: descrizione, etichetta: `${descrizione} × ${x.pezzi}${forn ? ` · ${forn}` : ""}` });
                              setApriAlbero(false);
                            }} />
                          </div>
                        </details>
                      </>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
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
                    <span className="text-xs text-neutral-500">{r.tipo === "A" ? `${r.fornitore ? ` · ${r.fornitore}` : ""}${r.costo !== null ? ` · costo ${r.costo.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean })}/${r.um}` : ""}` : `${r.gruppo ? ` · ${r.gruppo}` : ""} · ${r.colori.length} colori${r.griglia ? " · a misura" : ""}`}</span>
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
                <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">L ({scelto.unita})<input value={L} onChange={(e) => setL(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } }} inputMode="decimal" className={`${inp} w-24`} /></label>
                {scelto.conAltezza !== false && (<label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">H ({scelto.unita})<input value={H} onChange={(e) => setH(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } }} inputMode="decimal" className={`${inp} w-24`} /></label>)}
              </>
            )}
          </>
        )}
        <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">Quantità<input value={quantita} onChange={(e) => setQuantita(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } }} inputMode="numeric" className={`${inp} w-20`} /></label>
        <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">Fornitore
          <select value={fornitoreId} onChange={(e) => setFornitoreId(e.target.value)} className={`${inp} max-w-60`}>
            <option value="">{scelto ? "quello del listino" : "da scegliere…"}</option>
            {fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-neutral-800 flex flex-col gap-1">Note<input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } }} className={`${inp} w-48`} /></label>
        <button type="button" onClick={aggiungi} className="btn-3d btn-3d-teal text-sm px-3 py-1.5">➕ Aggiungi alla lista</button>
      </div>
      {errore && <p className="text-xs text-red-800">{errore}</p>}
    </div>
  );
}

/** Voci del listino: se hanno le due tendine (serramenti, porte, coprifili…) si sceglie con due menu a cascata, altrimenti elenco semplice. */
function VociATendine({ voci, scegli }: { voci: VoceLeggera[]; scegli: (value: string) => void }) {
  const [primo, setPrimo] = useState("");
  const conAssi = voci.length > 0 && voci.every((v) => v.assi);
  if (!conAssi) return <>{voci.map((v) => <button key={v.value} type="button" onClick={() => scegli(v.value)} className="block w-full text-left px-1.5 py-0.5 hover:bg-blue-50 rounded">{v.label}</button>)}</>;
  const primi = [...new Map(voci.map((v) => [v.assi![0].valore, v.assi![0].label])).entries()];
  const secondi = voci.filter((v) => v.assi![0].valore === primo);
  const sel = "border border-neutral-300 rounded px-2 py-1 text-xs bg-white max-w-full";
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <select value={primo} onChange={(e) => setPrimo(e.target.value)} className={sel} aria-label="Prima scelta">
        <option value="">Scegli…</option>
        {primi.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {primo && (
        <select value="" onChange={(e) => e.target.value && scegli(e.target.value)} className={sel} aria-label="Seconda scelta">
          <option value="">Poi scegli…</option>
          {secondi.map((v) => <option key={v.value} value={v.value}>{v.assi![1].label}</option>)}
        </select>
      )}
    </div>
  );
}

type GruppoAlbero = AlberoLeggero[number]["gruppi"][number];
/** Nel listino i gruppi «SERRAMENTI · PVC», «SERRAMENTI · Alluminio»… diventano una voce sola «SERRAMENTI» con la tendina del materiale (Ugo 22/11/2026). */
function raggruppaSerramenti(gruppi: GruppoAlbero[]): (GruppoAlbero | { materiali: { nome: string; gruppo: GruppoAlbero }[] })[] {
  const m = gruppi.filter((g) => g.nome.startsWith("SERRAMENTI · "));
  if (!m.length) return gruppi;
  const primo = gruppi.findIndex((g) => g.nome.startsWith("SERRAMENTI · "));
  const resto = gruppi.filter((g) => !g.nome.startsWith("SERRAMENTI · "));
  const nodo = { materiali: m.map((g) => ({ nome: g.nome.replace("SERRAMENTI · ", ""), gruppo: g })) };
  return [...resto.slice(0, primo), nodo, ...resto.slice(primo)];
}

function SerramentiATendina({ materiali, scegli }: { materiali: { nome: string; gruppo: GruppoAlbero }[]; scegli: (value: string) => void }) {
  const [mat, setMat] = useState("");
  const g = materiali.find((x) => x.nome === mat)?.gruppo;
  return (
    <div className="py-1">
      <select value={mat} onChange={(e) => setMat(e.target.value)} className="border border-neutral-300 rounded px-2 py-1 text-xs bg-white" aria-label="Materiale del serramento">
        <option value="">Materiale… (PVC, Alluminio, Legno…)</option>
        {materiali.map((x) => <option key={x.nome} value={x.nome}>{x.nome}</option>)}
      </select>
      {g && (
        <div className="mt-1">
          <VociATendine voci={g.voci} scegli={scegli} />
          {g.sottogruppi.map((sg) => (
            <details key={sg.nome}>
              <summary className="cursor-pointer text-neutral-700">{sg.nome}</summary>
              <div className="ml-3"><VociATendine voci={sg.voci} scegli={scegli} /></div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
