"use client";

// Tendina "Colore tessuto" per le tende a rullo da interno (RULLO A CATENA, RULLO
// XS, LOOK IN, TAGLI TESSUTO): a differenza di SelettoreTessuti.tsx (usato per le
// tende da sole Tempotest, dove il tessuto e' una scelta libera indipendente dal
// prezzo), qui il tessuto e' gia' fissato dal prodotto scelto in tendina (e determina
// il prezzo tramite la griglia larghezza×altezza) — resta solo da scegliere il colore
// specifico di quel tessuto, che non cambia il prezzo. Una sola tendina (niente
// cascata), con uno swatch colorato accanto a ciascuna voce (approssimazione visiva
// dal nome colore, non una foto del campionario reale) cosi' il colore "si vede",
// come richiesto — codice e nome restano quelli reali del catalogo fornitore
// "TESSUTI DA INTERNO" (vedi task #286).
import { useMemo, useState } from "react";

export type OptionalColoreTessuto = {
  id: string;
  categoria: string; // "Colore - <SLUG>"
  nome: string; // "<codice> — <colore>"
  note: string | null;
};

// Approssimazione visiva del colore a partire dal nome (in italiano) — non e' il
// colore esatto del tessuto fisico, solo un aiuto visivo nella tendina. Il nome e il
// codice reali restano sempre visibili come testo accanto allo swatch.
const PAROLE_COLORE: [RegExp, string][] = [
  [/bianco ghiaccio/i, "#f2f5f7"],
  [/bianco ottico/i, "#ffffff"],
  [/bianco naturale/i, "#f7f3ea"],
  [/bianco\/avorio|avorio\/bianco/i, "#f5efdd"],
  [/bianco/i, "#fdfdfb"],
  [/avorio/i, "#f2e9d0"],
  [/beige/i, "#e8d9b8"],
  [/sabbia/i, "#e0c9a0"],
  [/canapa/i, "#d9c79a"],
  [/daino/i, "#c9a877"],
  [/tortora/i, "#a99c8a"],
  [/testa di ?moro/i, "#4a3b30"],
  [/cioccolato/i, "#4a2f1f"],
  [/castagno/i, "#5c3d28"],
  [/noce/i, "#5a3a22"],
  [/rovere/i, "#8a6338"],
  [/frassino/i, "#c9b48a"],
  [/marrone chiaro/i, "#8a6a4a"],
  [/marrone scuro/i, "#4a2f1d"],
  [/marrone\/nero/i, "#3a2a20"],
  [/marrone/i, "#6b4327"],
  [/grigio\/bianco/i, "#c9c9c9"],
  [/grigio\/nero/i, "#4d4d4d"],
  [/grigio scuro/i, "#5a5a5a"],
  [/grigio chiaro/i, "#c4c4c4"],
  [/alluminio/i, "#a8adb3"],
  [/antracite/i, "#3a3f42"],
  [/grigio/i, "#8f8f8f"],
  [/nero/i, "#1a1a1a"],
  [/giallo/i, "#e8c93a"],
  [/arancione/i, "#e07b2b"],
  [/rosso/i, "#b5322a"],
  [/vinaccia/i, "#5e2333"],
  [/rosa/i, "#e3aebb"],
  [/verde pastello/i, "#a9d0a5"],
  [/verde acqua/i, "#8fc9bd"],
  [/verde scuro/i, "#2e4d2e"],
  [/verde/i, "#4e7c4e"],
  [/blu/i, "#2b3f6b"],
  [/celeste/i, "#a9c9e0"],
  [/azzurro/i, "#7fa8cf"],
];

function swatchDaNomeColore(colore: string): string {
  for (const [re, hex] of PAROLE_COLORE) {
    if (re.test(colore)) return hex;
  }
  return "#cfcac0"; // grigio neutro di fallback
}

export function SelettoreColoreTessutoRullo({
  optionali,
  formAction,
  rigaId,
  preventivoId,
}: {
  optionali: OptionalColoreTessuto[];
  formAction: (formData: FormData) => void;
  rigaId: string;
  preventivoId: string;
}) {
  const [optionalId, setOptionalId] = useState("");

  const ordinati = useMemo(
    () => [...optionali].sort((a, b) => a.nome.localeCompare(b.nome, "it")),
    [optionali]
  );

  const selezionato = ordinati.find((o) => o.id === optionalId) ?? null;
  const parti = selezionato ? selezionato.nome.split(" — ") : null;
  const nomeColoreSelezionato = parti && parti.length > 1 ? parti[1] : selezionato?.nome ?? "";

  if (ordinati.length === 0) {
    return (
      <p className="text-[10px] text-neutral-400 italic">
        Campionario colori non ancora disponibile per questo tessuto.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="rigaId" value={rigaId} />
      <input type="hidden" name="preventivoId" value={preventivoId} />
      <div className="flex items-center gap-1.5 flex-wrap">
        {selezionato && (
          <span
            className="inline-block w-4 h-4 rounded-full border border-neutral-300 shrink-0"
            style={{ backgroundColor: swatchDaNomeColore(nomeColoreSelezionato) }}
            title={nomeColoreSelezionato}
          />
        )}
        <select
          name="optionalId"
          value={optionalId}
          onChange={(e) => setOptionalId(e.target.value)}
          className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[240px]"
        >
          <option value="">Colore tessuto —</option>
          {ordinati.map((o) => (
            <option key={o.id} value={o.id}>{o.nome}</option>
          ))}
        </select>
        <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
        <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ colore</button>
      </div>
      {selezionato?.note && (
        <p className="text-[10px] text-neutral-400">{selezionato.note}</p>
      )}
    </form>
  );
}
