export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import BrandSwitcher from "@/components/BrandSwitcher";
import { aggiornaStatoPreventivo, archiviaOfferteScadute } from "@/app/actions";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { scopePreventivoWhere } from "@/lib/scope";

const COLONNE = [
  { stato: "APERTO", label: "Aperti" },
  { stato: "ACCETTATO", label: "Accettati" },
  { stato: "SCADUTO", label: "Scaduti" },
  { stato: "ANNULLATO", label: "Annullati" },
];

export default async function PreventiviPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; archivio?: string; q?: string }>;
}) {
  const { brand, archivio, q } = await searchParams;
  const inArchivio = archivio === "1";
  const ricerca = q?.trim();
  await archiviaOfferteScadute();
  const brandFiltro = brand && brand !== "Tutti" ? { brand: { nome: brand } } : {};
  const utente = await getCurrentUser();
  const preventivoScope = utente ? scopePreventivoWhere(utente) : {};

  // numeroOfferta è Int, non supporta contains — lo cerchiamo per conversione numerica
  const numeroRicercato = ricerca ? parseInt(ricerca, 10) : NaN;
  const ricercaWhere: Prisma.PreventivoWhereInput = ricerca
    ? {
        OR: [
          { cliente: { nome: { contains: ricerca, mode: "insensitive" } } },
          { commerciale: { nome: { contains: ricerca, mode: "insensitive" } } },
          ...(isNaN(numeroRicercato) ? [] : [{ numeroOfferta: numeroRicercato }]),
        ],
      }
    : {};

  const preventivi = await prisma.preventivo.findMany({
    where: { AND: [brandFiltro, preventivoScope, { archiviato: inArchivio }, ricercaWhere] },
    include: { cliente: true, commerciale: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">{inArchivio ? "Preventivi — Archivio" : "Preventivi"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/preventivi/nuovo" className="btn-3d btn-3d-green text-sm px-4 py-2">➕ Nuovo preventivo</Link>
          <Link
            href={inArchivio ? "/preventivi" : "/preventivi?archivio=1"}
            className="btn-3d text-sm px-3 py-2"
          >
            {inArchivio ? "← Torna ai preventivi attivi" : "🗄️ Archivio"}
          </Link>
        </div>
        <BrandSwitcher active={brand ?? "Tutti"} />
      </div>

      {/* Barra di ricerca preventivi */}
      <form action="" method="get" className="bg-white rounded-lg border border-neutral-200 p-3 mb-4 flex flex-col sm:flex-row gap-2">
        {brand && brand !== "Tutti" && <input type="hidden" name="brand" value={brand} />}
        {inArchivio && <input type="hidden" name="archivio" value="1" />}
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Cerca per cliente, commerciale o n° offerta…"
          className="flex-1 border border-neutral-200 rounded px-3 py-2 text-sm"
        />
        <button className="btn-3d btn-3d-teal text-sm px-4 py-2 whitespace-nowrap">Cerca</button>
        {ricerca && (
          <Link
            href={`/preventivi${brand && brand !== "Tutti" ? `?brand=${encodeURIComponent(brand)}` : ""}${inArchivio ? (brand && brand !== "Tutti" ? "&archivio=1" : "?archivio=1") : ""}`}
            className="text-xs text-neutral-600 underline self-center whitespace-nowrap"
          >
            azzera
          </Link>
        )}
      </form>


      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLONNE.map((col) => {
          const items = preventivi.filter((p) => p.stato === col.stato);
          return (
            <div key={col.stato}>
              <p className="text-xs font-medium text-neutral-700 mb-2">
                {col.label} · {items.length}
              </p>
              <div className="flex flex-col gap-2">
                {items.map((p) => (
                  <div key={p.id} className="bg-white rounded-lg border border-neutral-200 p-3">
                    <Link href={`/preventivi/${p.id}`} className="text-sm font-medium hover:underline">
                      {p.cliente.nome}
                    </Link>
                    <p className="text-xs font-semibold text-neutral-800 mt-1">
                      {p.numeroOfferta ? `Offerta N° ${p.numeroOfferta}` : "Offerta"} · {p.createdAt.toLocaleDateString("it-IT")}
                      {p.duplicatoDaId ? " · copia" : ""}
                    </p>
                    <p className="text-xs text-neutral-600">
                      {p.totaleNetto.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                    </p>
                    <p className="text-xs text-neutral-600">{p.commerciale.nome}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {COLONNE.filter((c) => c.stato !== p.stato).map((c) => (
                        <form key={c.stato} action={aggiornaStatoPreventivo}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="stato" value={c.stato} />
                          <button className="text-[11px] text-neutral-600 hover:text-neutral-700 underline">
                            → {c.label.toLowerCase()}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-neutral-500 italic">Vuoto</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
