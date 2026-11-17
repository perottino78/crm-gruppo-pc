"use client";

import { useState } from "react";

const NOME_FAMIGLIA: Record<string, string> = { INDOOR: "🏠 Indoor", OUTDOOR: "🌤️ Outdoor", SERVIZI: "🧾 Servizi e pratiche" };

/** «Dove compare nel listino»: famiglia (Indoor/Outdoor…) e gruppo (VETRATE, PERGOLE…). Campi `famiglia` e `gruppoListino`; vuoto = solo anagrafica. */
export default function ScegliPosizioneListino({ posizioni, famiglia = "", gruppo = "", onChange, compatto = false }: {
  posizioni: { famiglia: string; gruppi: string[] }[]; famiglia?: string | null; gruppo?: string | null;
  onChange?: (v: { famiglia: string; gruppo: string }) => void; compatto?: boolean;
}) {
  const [f, setF] = useState(famiglia ?? "");
  const [g, setG] = useState(gruppo ?? "");
  const gruppi = posizioni.find((p) => p.famiglia === f)?.gruppi ?? [];
  const cls = "rounded border border-neutral-300 px-2 py-1 text-sm";
  return (
    <span className={`flex flex-wrap items-end gap-2 ${compatto ? "" : "col-span-full"}`}>
      <label className="flex flex-col text-[11px] text-neutral-700">📍 Nel listino delle offerte
        <select name="famiglia" value={f} onChange={(e) => { setF(e.target.value); setG(""); onChange?.({ famiglia: e.target.value, gruppo: "" }); }} className={cls}>
          <option value="">— solo anagrafica (non compare nelle offerte) —</option>
          {posizioni.map((p) => <option key={p.famiglia} value={p.famiglia}>{NOME_FAMIGLIA[p.famiglia] ?? p.famiglia}</option>)}
        </select>
      </label>
      <label className="flex flex-col text-[11px] text-neutral-700">Gruppo
        <select name="gruppoListino" value={g} disabled={!f} onChange={(e) => { setG(e.target.value); onChange?.({ famiglia: f, gruppo: e.target.value }); }} className={cls}>
          <option value="">— tutta la famiglia —</option>
          {gruppi.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
    </span>
  );
}
