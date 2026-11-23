"use client";

import { useState } from "react";

/** Banca per l'incasso + IBAN: scegliendo la banca l'IBAN si riempie da solo (conti di Amministrazione › Banche). Resta modificabile. */
export default function BancaIban({ banche, ibanPerBanca, banca, iban, inp }: { banche: string[]; ibanPerBanca: Record<string, string>; banca: string; iban: string; inp: string }) {
  const [b, setB] = useState(banca);
  const [i, setI] = useState(iban || (banca ? ibanPerBanca[banca] ?? "" : ""));
  return (
    <>
      <label className="text-xs text-neutral-700">Banca per l&apos;incasso
        <select name="banca" value={b} onChange={(e) => { setB(e.target.value); setI(ibanPerBanca[e.target.value] ?? ""); }} className={inp}>
          <option value="">—</option>{banche.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <label className="text-xs text-neutral-700 sm:col-span-2">IBAN (si riempie da solo con la banca)
        <input name="iban" value={i} onChange={(e) => setI(e.target.value)} className={inp} />
      </label>
    </>
  );
}
