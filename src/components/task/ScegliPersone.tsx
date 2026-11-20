"use client";

// «Per chi» del nuovo task con più persone (richiesta di Ugo 20/11/2026): scegli un membro del team, va nell'elenco sotto e la tendina
// torna libera per aggiungerne un altro. Il primo è l'incaricato (campo «utenteId»), gli altri sono coinvolti («inCopiaA»):
// vedono il task, ricevono l'email e possono commentare.
import { useState } from "react";

type Persona = { id: string; nome: string };

export default function ScegliPersone({ utenti, iniziale, ioId, etichetta = "Per chi" }: { utenti: Persona[]; iniziale?: string; ioId: string; etichetta?: string }) {
  const [scelti, setScelti] = useState<string[]>(iniziale ? [iniziale] : []);
  const nome = (id: string) => {
    const n = utenti.find((x) => x.id === id)?.nome ?? "?";
    return id === ioId ? `${n} (io)` : n;
  };
  const liberi = utenti.filter((x) => !scelti.includes(x.id));
  return (
    <div className="text-xs font-semibold text-neutral-700">
      {etichetta}
      {scelti.length > 0 && (
        <ul className="mt-1 space-y-1">
          {scelti.map((id, i) => (
            <li key={id} className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-normal">
              <input type="hidden" name={i === 0 ? "utenteId" : "inCopiaA"} value={id} />
              <span><b>{nome(id)}</b> <span className="text-[11px] text-neutral-500">{i === 0 ? "· incaricato" : "· coinvolto"}</span></span>
              <button type="button" onClick={() => setScelti(scelti.filter((x) => x !== id))} className="text-red-700 hover:underline" aria-label={`Togli ${nome(id)}`}>✕ togli</button>
            </li>
          ))}
        </ul>
      )}
      <select
        value=""
        onChange={(e) => { const v = e.target.value; if (v) setScelti([...scelti, v]); }}
        className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-normal"
        aria-label="Aggiungi una persona"
      >
        <option value="">{scelti.length ? "➕ Aggiungi un'altra persona…" : "Scegli una persona del team…"}</option>
        {liberi.map((x) => <option key={x.id} value={x.id}>{x.id === ioId ? `${x.nome} (io)` : x.nome}</option>)}
      </select>
      {scelti.length === 0 && <p className="mt-1 text-[11px] font-normal text-neutral-500">Se non scegli nessuno, il task è tuo.</p>}
      {scelti.length > 1 && <p className="mt-1 text-[11px] font-normal text-neutral-500">Il primo è l&apos;incaricato; gli altri vedono il task, ricevono l&apos;email e possono commentare.</p>}
    </div>
  );
}
