"use client";

// Tendina "Motore" delle tende da sole, a cascata a 2 livelli: 1) Marca/tipo
// (il campo "categoria" dell'Optional — es. "Motore - Manuale", "Motore -
// Cherubini", "Motore - Nice", "Motore - Simu", "Motore - Somfy"), 2) variante
// specifica (meccanico/elettronico/radio + misura/coppia) dentro quella marca,
// con il relativo prezzo e codice articolo. Riusa il server action esistente
// aggiungiOptionalARiga.
import { useMemo, useState } from "react";

export type OptionalMotore = {
  id: string;
  categoria: string;
  nome: string;
  tipoPrezzo: string;
  valore: number;
  note: string | null;
};

export function SelettoreMotori({
  optionali,
  formAction,
  rigaId,
  preventivoId,
}: {
  optionali: OptionalMotore[];
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
    // "Motore - Manuale" sempre per primo, poi le marche in ordine alfabetico.
    out.sort((a, b) => {
      if (a === "Motore - Manuale") return -1;
      if (b === "Motore - Manuale") return 1;
      return a.localeCompare(b, "it");
    });
    return out;
  }, [optionali]);

  const variantiDellaMarca = useMemo(
    () => optionali.filter((o) => o.categoria === marca).sort((a, b) => a.nome.localeCompare(b.nome, "it")),
    [optionali, marca]
  );

  const etichettaMarca = (c: string) => c.replace(/^Motore - /, "");

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
          <option value="">1. Motore —</option>
          {marche.map((c) => (
            <option key={c} value={c}>{etichettaMarca(c)}</option>
          ))}
        </select>
        {marca && marca !== "Motore - Manuale" && (
          <select
            name="optionalId"
            value={optionalId}
            onChange={(e) => setOptionalId(e.target.value)}
            className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[260px]"
          >
            <option value="">2. Modello —</option>
            {variantiDellaMarca.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome} ({o.valore.toLocaleString("it-IT", { style: "currency", currency: "EUR" })})
              </option>
            ))}
          </select>
        )}
        {marca === "Motore - Manuale" && variantiDellaMarca[0] && (
          <input type="hidden" name="optionalId" value={variantiDellaMarca[0].id} />
        )}
      </div>
      {optionalId && (
        <>
          {variantiDellaMarca.find((o) => o.id === optionalId)?.note && (
            <p className="text-[10px] text-neutral-400">
              {variantiDellaMarca.find((o) => o.id === optionalId)?.note}
            </p>
          )}
        </>
      )}
      {(optionalId || marca === "Motore - Manuale") && (
        <div className="flex items-center gap-1 flex-wrap">
          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ motore</button>
        </div>
      )}
    </form>
  );
}
