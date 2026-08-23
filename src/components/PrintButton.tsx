"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden bg-neutral-900 text-white text-sm rounded px-4 py-2 fixed top-4 right-4 shadow-lg"
    >
      🖨️ Stampa / Salva PDF
    </button>
  );
}
