"use client";

// Tendina "Accessori motorizzazione" delle tende da sole, a cascata a 2
// livelli: 1) Marca (il campo "categoria" dell'Optional — es. "Accessorio
// motore - Cherubini", "Accessorio motore - Nice", "Accessorio motore -
// Simu", "Accessorio motore - Somfy"), 2) accessorio specifico (telecomando,
// centralina, sensore vento/sole/pioggia, gateway smart-home) dentro quella
// marca, con relativo prezzo e codice articolo. Riusa lo stesso pattern di
// SelettoreMotori.tsx e il server action esistente aggiungiOptionalARiga.
// A differenza del motore (che ha sempre una scelta obbligatoria, con
// "Manuale" come opzione base a costo zero), questi sono accessori facoltativi
// aggiuntivi: nessuna opzione base, si aggiungono solo se servono.
import { useMemo, useState } from "react";

export type OptionalAccessorioMotore = {
  id: string;
  categoria: string;
  nome: string;
  tipoPrezzo: string;
  valore: number;
  note: string | null;
};

export function SelettoreAccessoriMotore({
  optionali,
  formAction,
  rigaId,
  preventivoId,
}: {
  optionali: OptionalAccessorioMotore[];
  formAction: (formData: FormData) => void;
  rigaId: string;
  preventivoId: string;
}) {
  const [marca, setMarca] = useState("");
  const [optionalId, setOptionalId] = useState("");

  const marche = useMemo(() => {
    const viste = new Set<string>();
    const out: string[] = [];
    for (const o of optionali) {
      if (!viste.has(o.categoria)) {
        viste.add(o.categoria);
        out.push(o.categoria);
      }
    }
    return out.sort((a, b) => a.localeCompare(b, "it"));
  }, [optionali]);

  const accessoriDellaMarca = useMemo(
    () => optionali.filter((o) => o.categoria === marca).sort((a, b) => a.nome.localeCompare(b.nome, "it")),
    [optionali, marca]
  );

  const etichettaMarca = (c: string) => c.replace(/^Accessorio motore - /, "");

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="rigaId" value={rigaId} />
      <input type="hidden" name="preventivoId" value={preventivoId} />
      <div className="flex items-center gap-1 flex-wrap">
        <select
          value={marca}
          onChange={(e) => {
            setMarca(e.target.value);
            setOptionalId("");
          }}
          className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]"
        >
          <option value="">Accessorio motore —</option>
          {marche.map((c) => (
            <option key={c} value={c}>{etichettaMarca(c)}</option>
          ))}
        </select>
        {marca && (
          <select
            name="optionalId"
            value={optionalId}
            onChange={(e) => setOptionalId(e.target.value)}
            className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[260px]"
          >
            <option value="">Telecomando, centralina, sensore...</option>
            {accessoriDellaMarca.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome} ({o.valore.toLocaleString("it-IT", { style: "currency", currency: "EUR" })})
              </option>
            ))}
          </select>
        )}
      </div>
      {optionalId && accessoriDellaMarca.find((o) => o.id === optionalId)?.note && (
        <p className="text-[10px] text-neutral-400">
          {accessoriDellaMarca.find((o) => o.id === optionalId)?.note}
        </p>
      )}
      {optionalId && (
        <div className="flex items-center gap-1 flex-wrap">
          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ accessorio</button>
        </div>
      )}
    </form>
  );
}
