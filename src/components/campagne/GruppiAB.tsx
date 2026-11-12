"use client";

// A/B test (richiesta di Rocco): numero dei gruppi (a mano o con +/−), nome di ognuno e la sua versione dell'email (oggetto, preheader, corpo).
// Il pubblico scelto con i filtri si divide in parti uguali: qui si vede quanti contatti toccano a ogni gruppo.
import { useState } from "react";
import CampiEmail from "./CampiEmail";

type Gruppo = { id: string; nome: string; oggetto: string; preheader: string; formato: string; testo: string; html: string; usato: boolean };
const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";
const COLORI = ["border-teal-400 bg-teal-50/40", "border-orange-300 bg-orange-50/40", "border-blue-300 bg-blue-50/40", "border-purple-300 bg-purple-50/40", "border-pink-300 bg-pink-50/40"];
const lettera = (i: number) => String.fromCharCode(65 + i);

export default function GruppiAB({ iniziali, contatti, min = 2, max = 10 }: { iniziali: Gruppo[]; contatti: number; min?: number; max?: number }) {
  const minimo = Math.max(min, iniziali.filter((g) => g.usato).length);
  const [n, setN] = useState(Math.max(minimo, Math.min(max, iniziali.length || 2)));
  const [testoN, setTestoN] = useState(String(n));
  const cambia = (v: number) => { const x = Math.max(minimo, Math.min(max, Math.round(v) || minimo)); setN(x); setTestoN(String(x)); };
  const gruppi: Gruppo[] = Array.from({ length: n }, (_, i) => iniziali[i] ?? { id: "", nome: `Gruppo ${lettera(i)}`, oggetto: iniziali[0]?.oggetto ?? "", preheader: iniziali[0]?.preheader ?? "", formato: iniziali[0]?.formato ?? "TESTO", testo: iniziali[0]?.testo ?? "", html: iniziali[0]?.html ?? "", usato: false });
  const base = Math.floor(contatti / n), resto = contatti % n;
  return (
    <div className="space-y-3">
      <input type="hidden" name="gruppi" value={n} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Numero gruppi</span>
        <div className="flex items-center">
          <button type="button" onClick={() => cambia(n - 1)} disabled={n <= minimo} className="btn-3d btn-3d-outline px-3 py-1 text-lg leading-none disabled:opacity-40" aria-label="Un gruppo in meno">−</button>
          <input value={testoN} onChange={(e) => setTestoN(e.target.value.replace(/\D/g, ""))} onBlur={() => cambia(Number(testoN))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); cambia(Number(testoN)); } }}
            inputMode="numeric" aria-label="Numero gruppi" className={`${inp} mx-1 w-14 text-center text-base font-bold`} />
          <button type="button" onClick={() => cambia(n + 1)} disabled={n >= max} className="btn-3d btn-3d-outline px-3 py-1 text-lg leading-none disabled:opacity-40" aria-label="Un gruppo in più">+</button>
        </div>
        <span className="text-xs text-neutral-600">da {minimo} a {max} · {contatti} contatti divisi in parti uguali: {Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0)).join(" / ")}</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {gruppi.map((g, i) => (
          <fieldset key={i} className={`rounded-lg border-2 p-3 space-y-2 min-w-0 ${COLORI[i % COLORI.length]}`}>
            <input type="hidden" name={`g${i}_id`} value={g.id} />
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">{lettera(i)}</span>
              <input name={`g${i}_nome`} defaultValue={g.nome} aria-label={`Nome del gruppo ${lettera(i)}`} className={`${inp} w-full font-semibold`} />
            </div>
            <p className="text-[11px] text-neutral-600">≈ {base + (i < resto ? 1 : 0)} contatti{g.usato ? " · già partita: il gruppo resta" : ""}</p>
            <label className="text-xs text-neutral-600 block">Oggetto<input name={`g${i}_oggetto`} defaultValue={g.oggetto} placeholder="es. {nome}, la tua pergola con lo sconto" className={`${inp} w-full`} /></label>
            <CampiEmail prefisso={`g${i}_`} preheader={g.preheader} formato={g.formato} testo={g.testo} html={g.html} />
          </fieldset>
        ))}
      </div>
    </div>
  );
}
