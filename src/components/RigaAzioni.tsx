"use client";

import { useState, type ReactNode } from "react";
import { duplicaRigaPreventivo, rimuoviRigaPreventivo, modificaRigaPreventivo } from "@/app/actions";

// Riga "testata" di un prodotto nel preventivo: a sinistra le info prodotto
// (children, gia' renderizzate dal server), a destra prezzo + 3 pulsanti flat
// impilati (modifica/duplica/rimuovi). Se "modifica" e' aperto, il form di
// modifica misura/quantita/prezzo compare sotto, a piena larghezza. E'
// un componente client solo per governare l'apri/chiudi del form: il pulsante
// deve stare nella colonna azioni (accanto a duplica/rimuovi) mentre il form
// deve comparire sotto l'intera riga — due punti del DOM che il vecchio
// <details>/<summary> nativo non poteva collegare da solo.
export default function RigaAzioni({
  children,
  rigaId,
  preventivoId,
  subtotale,
  quantita,
  misuraLarghezza,
  misuraAltezza,
  prezzoUnitario,
  unit,
}: {
  children: ReactNode;
  rigaId: string;
  preventivoId: string;
  subtotale: number;
  quantita: number;
  misuraLarghezza: number | null;
  misuraAltezza: number | null;
  prezzoUnitario: number;
  unit: string;
}) {
  const [aperto, setAperto] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between">
        {children}
        <div className="flex items-start gap-3">
          <span className="font-medium pt-1">{subtotale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
          <div className="flex flex-col gap-1 w-[84px] shrink-0">
            <button type="button" onClick={() => setAperto((v) => !v)} className="btn-flat btn-flat-neutral w-full">
              ✏️ modifica
            </button>
            <form action={duplicaRigaPreventivo}>
              <input type="hidden" name="id" value={rigaId} />
              <input type="hidden" name="preventivoId" value={preventivoId} />
              <button className="btn-flat btn-flat-green w-full">⧉ duplica</button>
            </form>
            <form action={rimuoviRigaPreventivo}>
              <input type="hidden" name="id" value={rigaId} />
              <input type="hidden" name="preventivoId" value={preventivoId} />
              <button className="btn-flat btn-flat-red w-full">rimuovi</button>
            </form>
          </div>
        </div>
      </div>

      {aperto && (
        <div className="mt-1.5 text-[11px]">
          <form action={modificaRigaPreventivo} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={rigaId} />
            <input type="hidden" name="preventivoId" value={preventivoId} />
            <div className="flex flex-col">
              <label className="text-[10px] text-neutral-500">Quantità</label>
              <input
                name="quantita"
                type="number"
                min={1}
                defaultValue={quantita}
                className="w-16 border border-neutral-200 rounded px-1.5 py-1 text-xs"
              />
            </div>
            {misuraLarghezza != null && misuraAltezza != null ? (
              <>
                <div className="flex flex-col">
                  <label className="text-[10px] text-neutral-500">Larghezza {unit}</label>
                  <input
                    name="larghezza"
                    type="number"
                    step="0.1"
                    defaultValue={misuraLarghezza}
                    className="w-20 border border-neutral-200 rounded px-1.5 py-1 text-xs"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] text-neutral-500">Altezza {unit}</label>
                  <input
                    name="altezza"
                    type="number"
                    step="0.1"
                    defaultValue={misuraAltezza}
                    className="w-20 border border-neutral-200 rounded px-1.5 py-1 text-xs"
                  />
                </div>
                <p className="text-[10px] text-neutral-500 basis-full">
                  Il prezzo unitario viene ricalcolato automaticamente sulla nuova misura.
                </p>
              </>
            ) : (
              <div className="flex flex-col">
                <label className="text-[10px] text-neutral-500">Prezzo unitario</label>
                <input
                  name="prezzoUnitarioManuale"
                  type="number"
                  step="0.01"
                  defaultValue={prezzoUnitario}
                  className="w-24 border border-neutral-200 rounded px-1.5 py-1 text-xs"
                />
              </div>
            )}
            <button className="btn-3d btn-3d-blue text-[11px] px-2 py-1">salva modifiche</button>
          </form>
        </div>
      )}
    </>
  );
}
