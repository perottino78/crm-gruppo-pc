"use client";

import { useSearchParams } from "next/navigation";
import { brandInfo } from "@/lib/brands";

// Barra colorata in cima al contenuto principale: dà identità visiva immediata
// al brand attivo (o un grigio neutro su "Tutti"), su ogni pagina dell'app.
export default function AccentBar() {
  const searchParams = useSearchParams();
  const brand = searchParams.get("brand") ?? "Tutti";
  const info = brandInfo(brand === "Tutti" ? undefined : brand);

  return (
    <div
      className="h-1.5 w-full print:hidden"
      style={{ background: `linear-gradient(90deg, ${info.primary}, ${info.accent})` }}
    />
  );
}
