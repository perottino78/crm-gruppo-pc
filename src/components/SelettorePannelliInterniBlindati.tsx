"use client";

// Tendina "Pannelli interni" dei Portoncini Blindati (task Blindati:
// aggiunta pannelli interni — vedi messaggio utente su pannelli esterni/
// interni mancanti). Il catalogo Blindati oggi non ha ancora un listino reale
// di finiture interne (e' tutto lato esterno/faccia a vista): questo
// selettore parte da due ancore segnaposto — "STD" e "A pagamento" — con
// prezzo 0 in attesa che l'utente fornisca l'elenco reale con i prezzi.
// In entrambi i casi il nome della finitura va scritto nel campo libero;
// per "A pagamento" e' disponibile anche un campo prezzo libero (per "STD"
// il prezzo resta a 0, coerente con "incluso"). Riusa il server action
// esistente aggiungiOptionalARiga (nota + prezzoManuale).
import { useMemo, useState } from "react";

export type OptionalPannelloInterno = {
  id: string;
  categoria: string;
  nome: string;
  tipoPrezzo: string;
  valore: number;
};

const CATEGORIA_STD = "Pannello Interno - STD";
const CATEGORIA_PAGAMENTO = "Pannello Interno - A pagamento";

export function SelettorePannelliInterniBlindati({
  optionali,
  formAction,
  rigaId,
  preventivoId,
}: {
  optionali: OptionalPannelloInterno[];
  formAction: (formData: FormData) => void;
  rigaId: string;
  preventivoId: string;
}) {
  const [tipo, setTipo] = useState<"" | typeof CATEGORIA_STD | typeof CATEGORIA_PAGAMENTO>("");
  const [nomeLibero, setNomeLibero] = useState("");
  const [prezzoLibero, setPrezzoLibero] = useState("");

  const anchorStd = useMemo(() => optionali.find((o) => o.categoria === CATEGORIA_STD), [optionali]);
  const anchorPagamento = useMemo(() => optionali.find((o) => o.categoria === CATEGORIA_PAGAMENTO), [optionali]);

  const optionalSelezionato = tipo === CATEGORIA_STD ? anchorStd : tipo === CATEGORIA_PAGAMENTO ? anchorPagamento : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="rigaId" value={rigaId} />
      <input type="hidden" name="preventivoId" value={preventivoId} />
      {optionalSelezionato && <input type="hidden" name="optionalId" value={optionalSelezionato.id} />}
      <div className="flex items-center gap-1">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
          className="text-xs border border-neutral-200 rounded px-1.5 py-1 max-w-[220px]"
        >
          <option value="">Pannello interno —</option>
          {anchorStd && <option value={CATEGORIA_STD}>STD (incluso)</option>}
          {anchorPagamento && <option value={CATEGORIA_PAGAMENTO}>A pagamento</option>}
        </select>
      </div>
      {optionalSelezionato && (
        <div className="flex items-center gap-1 flex-wrap">
          <input
            name="nota"
            type="text"
            value={nomeLibero}
            onChange={(e) => setNomeLibero(e.target.value)}
            placeholder='es. "bianco liscio" o finitura richiesta'
            className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-56"
          />
          {tipo === CATEGORIA_PAGAMENTO && (
            <input
              name="prezzoManuale"
              type="number"
              step="0.01"
              value={prezzoLibero}
              onChange={(e) => setPrezzoLibero(e.target.value)}
              placeholder="prezzo €"
              className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-28"
            />
          )}
          <input name="quantita" type="number" defaultValue={1} min={1} className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-14" />
          <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ pannello interno</button>
        </div>
      )}
    </form>
  );
}
