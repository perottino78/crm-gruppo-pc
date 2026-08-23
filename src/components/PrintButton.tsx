"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="btn-3d btn-3d-dark print:hidden text-sm px-4 py-2 fixed top-4 right-4 shadow-lg"
    >
      🖨️ Stampa / Salva PDF
    </button>
  );
}
