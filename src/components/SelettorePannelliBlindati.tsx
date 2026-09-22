"use client";

// Tendina "Pannelli esterni" dei Portoncini Blindati, divisa in cascata a 2
// livelli invece dell'unico <select> con quasi 1000 voci usato in precedenza:
// 1) Collezione (il campo "categoria" dell'Optional — es. "Pannello",
// "Pannello Tradizione - Basic Collection", "Pannello Contemporaneo - Planar"...),
// 2) Finitura specifica dentro quella collezione (nome + prezzo). Nella
// collezione "Pannello" e' presente anche un'ancora "scrittura libera" per le
// finiture esterne non a catalogo (es. "a copiare" quando manca sul listino
// anta doppia, o qualunque pannello a richiesta): selezionandola compaiono un
// campo nome libero e un campo prezzo libero, inviati come nota/prezzoManuale
// al server action esistente aggiungiOptionalARiga (vedi task #235-237).
import { useMemo, useState } from "react";

export type OptionalPannello = {
  id: string;
  categoria: string;
  nome: string;
  tipoPrezzo: string;
  valore: number;
};

export function SelettorePannelliBlindati({
  optionali,
  formAction,
  rigaId,
  preventivoId,
}: {
  optionali: OptionalPannello[];
  formAction: (formData: FormData) => void;
  rigaId: string;
  preventivoId: string;
}) {
  const [collezione, setCollezione] = useState("");
  const [optionalId, setOptionalId] = useState("");
  const [nomeLibero, setNomeLibero] = useState("");
  const [prezzoLibero, setPrezzoLibero] = useState("");

  // Ordine: prima "Pannello" (le finiture generiche non legate a una collezione
  // firmata: Facestone, Acrilico, Alluminio liscio/bugnato, Pantografati,
  // scrittura libera...), poi tutte le collezioni Tradizione/Contemporaneo in
  // ordine alfabetico.
  const collezioni = useMemo(() => {
    const viste = new Set<string>();
    const out: string[] = [];
    for (const o of optionali) {
      if (!viste.has(o.categoria)) {
        viste.add(o.categoria);
        out.push(o.categoria);
      }
    }
    out.sort((a, b) => {
      if (a === "Pannello") return -1;
      if (b === "Pannello") return 1;
      return a.localeCompare(b, "it");
    });
    return out;
  }, [optionali]);

  const finitureDellaCollezione = useMemo(
    () => optionali.filter((o) => o.categoria === collezione),
    [optionali, collezione]
  );

  const etichettaCollezione = (c: string) => (c === "Pannello" ? "Pannello base (generico)" : c.replace(/^Pannello (Tradizione|Contemporaneo) - /, ""));

  const optionalScelto = finitureDellaCollezione.find((o) => o.id === optionalId);
  const eScritturaLibera = !!optionalScelto && optionalScelto.nome.includes("scrittura libera");

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="rigaId" value={rigaId} />
      <input type="hidden" name="preventivoId" value={preventivoId} />
      <div className="flex items-center gap-1">
        <select
          value={collezione}
          onChange={(e) => {
            setCollezione(e.target.value);
            setOptionalId("");
          }}
          className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]"
        >
          <option value="">1. Collezione esterno —</option>
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
            <option value="">2. Finitura —</option>
            {finitureDellaCollezione.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome.includes("scrittura libera")
                  ? "✎ Scrittura libera (nome + prezzo a mano)"
                  : `${o.nome} (${o.tipoPrezzo === "PERCENTUALE" ? `${o.valore}%` : `${o.valore}€`})`}
              </option>
            ))}
          </select>
        )}
      </div>
      {optionalId && eScritturaLibera && (
        <div className="flex items-center gap-1 flex-wrap">
          <input
            name="nota"
            type="text"
            value={nomeLibero}
            onChange={(e) => setNomeLibero(e.target.value)}
            placeholder='es. "pannello a copiare" o finitura richiesta'
            className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-56"
          />
          <input
            name="prezzoManuale"
            type="number"
            step="0.01"
            value={prezzoLibero}
            onChange={(e) => setPrezzoLibero(e.target.value)}
            placeholder="prezzo/sovrapprezzo €"
            className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-32"
          />
        </div>
      )}
      {optionalId && (
        <div className="flex items-center gap-1">
          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ pannello esterno</button>
        </div>
      )}
    </form>
  );
}
