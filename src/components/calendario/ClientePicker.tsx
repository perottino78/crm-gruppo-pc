"use client";

import { useEffect, useRef, useState } from "react";

type Voce = { id: string; nome: string; sotto: string; indirizzo: string };

/** Campo "Cliente" con ricerca mentre si scrive; compila anche il luogo con l'indirizzo del cliente */
export default function ClientePicker({ iniziale }: { iniziale?: { id: string; nome: string } | null }) {
  const [q, setQ] = useState(iniziale?.nome ?? "");
  const [scelto, setScelto] = useState<{ id: string; nome: string } | null>(iniziale ?? null);
  const [voci, setVoci] = useState<Voce[]>([]);
  const [aperto, setAperto] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scelto && q === scelto.nome) return;
    const t = setTimeout(async () => {
      if (q.trim().length < 2) return setVoci([]);
      const r = await fetch(`/api/clienti/cerca?q=${encodeURIComponent(q)}`);
      if (r.ok) {
        setVoci(await r.json());
        setAperto(true);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, scelto]);

  function scegli(v: Voce) {
    setScelto({ id: v.id, nome: v.nome });
    setQ(v.nome);
    setAperto(false);
    const luogo = box.current?.closest("form")?.querySelector<HTMLInputElement>('input[name="luogo"]');
    if (luogo && !luogo.value && v.indirizzo) luogo.placeholder = v.indirizzo;
  }

  return (
    <div ref={box} className="relative">
      <input type="hidden" name="clienteId" value={scelto?.id ?? ""} />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setScelto(null);
        }}
        onFocus={() => voci.length && setAperto(true)}
        placeholder="Cerca per nome, telefono, comune…"
        className={`w-full border rounded px-2 py-1.5 text-sm ${scelto ? "border-green-500 bg-green-50 font-semibold" : "border-neutral-300"}`}
        autoComplete="off"
        required
      />
      {aperto && voci.length > 0 && !scelto && (
        <ul className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
          {voci.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => scegli(v)} className="w-full text-left px-3 py-2 hover:bg-blue-50">
                <span className="block text-sm font-semibold text-neutral-900">{v.nome}</span>
                {v.sotto && <span className="block text-[11px] text-neutral-600">{v.sotto}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!scelto && q.trim().length >= 2 && voci.length === 0 && (
        <p className="mt-1 text-[11px] text-amber-700">Nessun cliente trovato: crealo prima da Clienti › Nuovo.</p>
      )}
    </div>
  );
}
