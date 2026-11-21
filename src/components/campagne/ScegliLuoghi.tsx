"use client";

// Dove abitano i destinatari: più province (con le regioni) e più comuni (richiesta di Ugo 20/11/2026).
import { useMemo, useState } from "react";
import { normalizza } from "@/lib/geo/normalizza";

export type OpzioneProvincia = { sigla: string; nome: string; regione: string; n: number };
export type OpzioneComune = { nome: string; sigla: string | null; n: number };

type Props = {
  province: OpzioneProvincia[];
  comuni: OpzioneComune[];
  scelteProvince: string[];
  scelteComuni: string[];
  /** contatti raggiungibili senza provincia nell'anagrafica */
  senzaProvincia: number;
  /** pulsante «completa le province» (azione del server, nel modulo della campagna) */
  azioneCompleta?: (fd: FormData) => void | Promise<void>;
};

export default function ScegliLuoghi({ province, comuni, scelteProvince, scelteComuni, senzaProvincia, azioneCompleta }: Props) {
  const [prov, setProv] = useState<string[]>(scelteProvince);
  const [com, setCom] = useState<string[]>(scelteComuni);
  const [cerca, setCerca] = useState("");
  const [soloConContatti, setSoloConContatti] = useState(true);

  const q = normalizza(cerca);
  const gruppi = useMemo(() => {
    const m = new Map<string, OpzioneProvincia[]>();
    for (const p of province) {
      if (soloConContatti && p.n === 0 && !prov.includes(p.sigla)) continue;
      if (q && !normalizza(p.nome).includes(q) && !normalizza(p.regione).includes(q) && !p.sigla.toLowerCase().startsWith(q)) continue;
      if (!m.has(p.regione)) m.set(p.regione, []);
      m.get(p.regione)!.push(p);
    }
    return [...m.entries()];
  }, [province, q, soloConContatti, prov]);

  const suggeriti = useMemo(() => {
    if (q.length < 2) return [];
    return comuni.filter((c) => !com.some((x) => normalizza(x) === normalizza(c.nome)) && normalizza(c.nome).includes(q)).slice(0, 12);
  }, [comuni, com, q]);

  const nDi = (sigle: string[]) => province.filter((p) => sigle.includes(p.sigla)).reduce((t, p) => t + p.n, 0);
  const alterna = (sigla: string) => setProv((l) => (l.includes(sigla) ? l.filter((x) => x !== sigla) : [...l, sigla]));
  const alternaRegione = (sigle: string[]) => setProv((l) => (sigle.every((s) => l.includes(s)) ? l.filter((x) => !sigle.includes(x)) : [...new Set([...l, ...sigle])]));
  const totale = prov.length + com.length;

  return (
    <div className="rounded border border-sky-200 bg-sky-50/50 p-3 space-y-3">
      {prov.map((s) => <input key={s} type="hidden" name="province" value={s} />)}
      {com.map((c) => <input key={c} type="hidden" name="comuni" value={c} />)}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-neutral-700">📍 Dove abitano (nessuna scelta = ovunque)</p>
        <p className="text-xs text-neutral-600">
          {totale === 0 ? "Tutta Italia" : `${prov.length} ${prov.length === 1 ? "provincia" : "province"}${com.length ? ` e ${com.length} ${com.length === 1 ? "comune" : "comuni"}` : ""} · circa ${nDi(prov)} contatti nelle province`}
          {totale > 0 && <button type="button" onClick={() => { setProv([]); setCom([]); }} className="ml-2 underline text-neutral-700">togli tutto</button>}
        </p>
      </div>

      <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca una provincia, una regione o un comune (es. Cuneo, Lombardia, Rosta)"
        aria-label="Cerca un luogo" className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm" />

      {(prov.length > 0 || com.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {prov.map((s) => { const p = province.find((x) => x.sigla === s); return (
            <button key={s} type="button" onClick={() => alterna(s)} className="rounded-full border border-teal-400 bg-teal-50 px-2 py-0.5 text-xs" title="Togli">{p?.nome ?? s} ✕</button>
          ); })}
          {com.map((c) => <button key={c} type="button" onClick={() => setCom((l) => l.filter((x) => x !== c))} className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs" title="Togli">🏘 {c} ✕</button>)}
        </div>
      )}

      {suggeriti.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] text-neutral-600">Comuni trovati (clicca per aggiungere):</p>
          <div className="flex flex-wrap gap-1.5">
            {suggeriti.map((c) => (
              <button key={c.nome} type="button" onClick={() => { setCom((l) => [...l, c.nome]); setCerca(""); }} className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs hover:border-orange-400">
                🏘 {c.nome}{c.sigla ? ` (${c.sigla})` : ""} <span className="text-neutral-500">{c.n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-700">
        <label className="flex items-center gap-1"><input type="checkbox" checked={soloConContatti} onChange={(e) => setSoloConContatti(e.target.checked)} /> mostra solo le province con contatti</label>
        {senzaProvincia > 0 && (
          <span className="text-amber-800">
            ⚠️ {senzaProvincia.toLocaleString("it-IT")} contatti non hanno la provincia: non finiscono in nessuna provincia scelta.
            {azioneCompleta && <button type="submit" formAction={azioneCompleta} className="ml-2 rounded border border-amber-400 bg-white px-2 py-0.5 font-semibold underline" title="La ricava dal CAP e dal comune. Salva anche le scelte fatte qui.">📍 Completa le province dai CAP e dai comuni</button>}
          </span>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto rounded border border-neutral-200 bg-white p-2 space-y-2">
        {gruppi.length === 0 && <p className="text-xs text-neutral-500">Nessuna provincia trovata{q ? ` per «${cerca}»` : ""}.</p>}
        {gruppi.map(([regione, lista]) => {
          const sigle = lista.map((p) => p.sigla);
          const tutte = sigle.every((s) => prov.includes(s));
          return (
            <div key={regione}>
              <button type="button" onClick={() => alternaRegione(sigle)} className="text-xs font-bold text-neutral-800 hover:underline" title="Spunta o togli tutte le province della regione">
                {tutte ? "☑" : "☐"} {regione} <span className="font-normal text-neutral-500">({nDi(sigle).toLocaleString("it-IT")})</span>
              </button>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {lista.map((p) => (
                  <label key={p.sigla} className={`flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${prov.includes(p.sigla) ? "border-teal-400 bg-teal-50" : "border-neutral-200"} ${p.n === 0 ? "text-neutral-400" : ""}`}>
                    <input type="checkbox" checked={prov.includes(p.sigla)} onChange={() => alterna(p.sigla)} />
                    {p.nome} <span className="text-neutral-500">{p.n.toLocaleString("it-IT")}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
