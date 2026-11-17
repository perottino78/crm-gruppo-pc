"use client";

/** «Stampa / Salva PDF»: apre la stampa del browser (da lì si salva in PDF). */
export default function BottoneStampa() {
  return <button type="button" onClick={() => window.print()} className="btn-3d btn-3d-blue px-4 py-1.5 text-sm">🖨️ Stampa / Salva PDF</button>;
}
