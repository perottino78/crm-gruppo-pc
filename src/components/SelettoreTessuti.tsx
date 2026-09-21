"use client";

// Tendina "Tessuto Tempotest" delle tende da sole, a cascata a 2 livelli invece
// dell'unico <select> con ~530 voci: 1) Collezione (il campo "categoria"
// dell'Optional — es. "Tessuto - Materia", "Tessuto - Starlight blue"...),
// 2) Codice specifico dentro quella collezione. In più, uno slot di scrittura
// libera per indicare/correggere a mano il codice esatto letto dal campionario
// fisico Tempotest, quando quello pre-catalogato non è affidabile al 100% (vedi
// task #210 — l'estrazione dal catalogo per immagini può avere piccoli errori
// di trascrizione sulle ultime cifre del codice). Riusa il server action
// esistente aggiungiOptionalARiga, che ora accetta anche il campo "nota".
import { useMemo, useState } from "react";

export type OptionalTessuto = {
  id: string;
  categoria: string;
  nome: string;
  note: string | null;
};

export function SelettoreTessuti({
  optionali,
  formAction,
  rigaId,
  preventivoId,
}: {
  optionali: OptionalTessuto[];
  formAction: (formData: FormData) => void;
  rigaId: string;
  preventivoId: string;
}) {
  const [collezione, setCollezione] = useState("");
  const [optionalId, setOptionalId] = useState("");
  const [nota, setNota] = useState("");

  const collezioni = useMemo(() => {
    const viste = new Set<string>();
    const out: string[] = [];
    for (const o of optionali) {
      if (!viste.has(o.categoria)) {
        viste.add(o.categoria);
        out.push(o.categoria);
      }
    }
    out.sort((a, b) => a.localeCompare(b, "it"));
    return out;
  }, [optionali]);

  const codiciDellaCollezione = useMemo(
    () => optionali.filter((o) => o.categoria === collezione).sort((a, b) => a.nome.localeCompare(b.nome, "it")),
    [optionali, collezione]
  );

  const etichettaCollezione = (c: string) => c.replace(/^Tessuto - /, "");

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="rigaId" value={rigaId} />
      <input type="hidden" name="preventivoId" value={preventivoId} />
      <div className="flex items-center gap-1 flex-wrap">
        <select
          value={collezione}
          onChange={(e) => {
            setCollezione(e.target.value);
            setOptionalId("");
          }}
          className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]"
        >
          <option value="">1. Collezione tessuto —</option>
          {collezioni.map((c) => (
            <option key={c} value={c}>{etichettaCollezione(c)}</option>
          ))}
        </select>
        {collezione && (
          <select
            name="optionalId"
            value={optionalId}
            onChange={(e) => setOptionalId(e.target.value)}
            className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]"
          >
            <option value="">2. Codice —</option>
            {codiciDellaCollezione.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>
        )}
      </div>
      {optionalId && (
        <>
          {codiciDellaCollezione.find((o) => o.id === optionalId)?.note && (
            <p className="text-[10px] text-neutral-400">
              {codiciDellaCollezione.find((o) => o.id === optionalId)?.note}
            </p>
          )}
          <div className="flex items-center gap-1 flex-wrap">
            <input
              name="nota"
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="codice esatto da campionario (facoltativo, corregge quello sopra)"
              className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-64"
            />
            <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
            <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ tessuto</button>
          </div>
        </>
      )}
    </form>
  );
}
