"use client";

// Modulo «Legno piallato per vetrate» nell'ordine (richiesta di Ugo 20/11/2026): per ogni sezione pezzi e lunghezza, con il conto
// della cubatura mentre si scrive (metri, m³ e prezzo). Il prezzo concordato al m³ va nella scheda; senza, la stima usa il prezzo indicativo e resta solo qui.
import { useState } from "react";
import { LUNGHEZZA_STANDARD, PREZZO_M3_INDICATIVO, RIGHE_LIBERE, riepilogoLegno, sezioneDellaRiga } from "@/lib/ordini/legno";

const n2 = (n: number, dec = 2) => n.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: "always" as unknown as boolean });

export default function TabellaLegno({ righe, iniziali = {}, salva, modificabile = true }: { righe: number[]; iniziali?: Record<string, string>; salva?: (fd: FormData) => Promise<void>; modificabile?: boolean }) {
  // si parte dalle righe LEGNO-… già nell'ordine (articoli Complementi vetrate › Legni piallati)
  const [valori, setValori] = useState<Record<string, string>>(iniziali);
  const set = (k: string, v: string) => setValori((x) => ({ ...x, [k]: v }));
  const prezzoScritto = Number((valori.prezzo_m3 ?? "").replace(",", ".")) || 0;
  const r = riepilogoLegno(valori, prezzoScritto || PREZZO_M3_INDICATIVO);
  const perRiga = new Map(r.righe.map((x) => [x.riga, x]));
  const inp = "w-20 px-1 py-1 text-xs";
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-neutral-800">🪵 Misure del legno piallato (sezione in mm)</p>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead><tr className="bg-neutral-50">
            {["#", "Sezione", "Pezzi", "Lunghezza mm", "m³", "€ a barra", "Totale €"].map((h) => <th key={h} className="border border-neutral-300 px-1.5 py-0.5 font-semibold">{h}</th>)}
          </tr></thead>
          <tbody>
            {righe.map((n) => {
              const s = sezioneDellaRiga(n);
              const x = perRiga.get(n);
              return (
                <tr key={n} className={x ? "bg-amber-50" : ""}>
                  <td className="px-1.5 text-neutral-500">{n}</td>
                  <td className="border border-neutral-300 px-1.5 font-semibold whitespace-nowrap">{s ? `${s.spessore} × ${s.larghezza}` : "?"}</td>
                  <td className="border border-neutral-300 p-0"><input name={`campo_tab_legno_${n}_pezzi`} inputMode="numeric" className={inp} value={valori[`tab_legno_${n}_pezzi`] ?? ""} onChange={(e) => set(`tab_legno_${n}_pezzi`, e.target.value)} aria-label={`Pezzi ${s?.spessore}×${s?.larghezza}`} /></td>
                  <td className="border border-neutral-300 p-0"><input name={(valori[`tab_legno_${n}_pezzi`] ?? "").trim() ? `campo_tab_legno_${n}_lunghezza` : undefined} inputMode="numeric" className={inp} value={valori[`tab_legno_${n}_lunghezza`] ?? String(LUNGHEZZA_STANDARD)} onChange={(e) => set(`tab_legno_${n}_lunghezza`, e.target.value)} aria-label={`Lunghezza ${s?.spessore}×${s?.larghezza}`} /></td>
                  <td className="border border-neutral-300 px-1.5 text-right">{x ? n2(x.m3, 4) : ""}</td>
                  <td className="border border-neutral-300 px-1.5 text-right">{x?.prezzoBarra != null ? n2(x.prezzoBarra) : ""}</td>
                  <td className="border border-neutral-300 px-1.5 text-right font-semibold">{x?.totale != null ? n2(x.totale) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs font-bold text-neutral-800">✏️ Misure libere (spessore e larghezza a piacere)</p>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead><tr className="bg-neutral-50">
            {["#", "Spessore mm", "Larghezza mm", "Pezzi", "Lunghezza mm", "m³", "€ a barra", "Totale €"].map((h) => <th key={h} className="border border-neutral-300 px-1.5 py-0.5 font-semibold">{h}</th>)}
          </tr></thead>
          <tbody>
            {Array.from({ length: RIGHE_LIBERE }, (_, i) => i + 1).map((n) => {
              const x = perRiga.get(100 + n);
              const k = (c: string) => `tab_legnol_${n}_${c}`;
              const campo = (c: string) => <input name={`campo_${k(c)}`} inputMode="numeric" className={inp} value={valori[k(c)] ?? (c === "lunghezza" ? String(LUNGHEZZA_STANDARD) : "")} onChange={(e) => set(k(c), e.target.value)} aria-label={`${c} misura libera ${n}`} />;
              return (
                <tr key={n} className={x ? "bg-amber-50" : ""}>
                  <td className="px-1.5 text-neutral-500">L{n}</td>
                  <td className="border border-neutral-300 p-0">{campo("spessore")}</td>
                  <td className="border border-neutral-300 p-0">{campo("larghezza")}</td>
                  <td className="border border-neutral-300 p-0">{campo("pezzi")}</td>
                  <td className="border border-neutral-300 p-0">{campo("lunghezza")}</td>
                  <td className="border border-neutral-300 px-1.5 text-right">{x ? n2(x.m3, 4) : ""}</td>
                  <td className="border border-neutral-300 px-1.5 text-right">{x?.prezzoBarra != null ? n2(x.prezzoBarra) : ""}</td>
                  <td className="border border-neutral-300 px-1.5 text-right font-semibold">{x?.totale != null ? n2(x.totale) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end gap-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
        <label className="font-semibold">Prezzo concordato €/m³ (facoltativo, va nella scheda)
          <input name="campo_prezzo_m3" inputMode="decimal" placeholder={`es. ${PREZZO_M3_INDICATIVO}`} className="mt-0.5 block w-32 rounded border border-neutral-300 px-2 py-1 text-sm" value={valori.prezzo_m3 ?? ""} onChange={(e) => set("prezzo_m3", e.target.value)} />
        </label>
        <p><b>{r.pezzi}</b> pezzi · <b>{n2(r.metri, 1)}</b> m lineari · <b>{n2(r.m3, 4)}</b> m³ · <b>{r.totale != null ? `${n2(r.totale)} €` : "—"}</b>
          {!prezzoScritto && <span className="text-neutral-600"> (stima con {PREZZO_M3_INDICATIVO} €/m³, solo per te: nella scheda va il prezzo solo se lo scrivi)</span>}</p>
      </div>
      {salva && modificabile && (
        <div className="flex flex-wrap items-center gap-3">
          <button formAction={salva} className="btn-3d btn-3d-green px-4 py-2 text-sm">💾 Salva il legno nell&apos;ordine</button>
          <span className="text-[11px] text-neutral-600">Mette nell&apos;ordine una riga per misura (articoli «Legni piallati», prezzo a barra sullo sviluppo) e aggiorna la scheda da allegare: all&apos;invio il totale dei legni c&apos;è già.</span>
        </div>
      )}
      {Object.keys(iniziali).length > 0 && <p className="text-[11px] text-green-800">✓ Precompilato con il legno già nelle righe dell&apos;ordine.</p>}
    </div>
  );
}
