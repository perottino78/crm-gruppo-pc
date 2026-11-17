export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CEDENTE } from "@/lib/fatturazione/tabelle";
import { labelBreveTipologia } from "@/lib/prodotti";
import BottoneStampa from "@/components/BottoneStampa";

/**
 * Scheda del prodotto leggera in HTML (richiesta di Ugo, 17/11/2026): foto, descrizione tecnica e dati di P&C, senza prezzi.
 * Si apre dall'offerta (link «Scheda del prodotto») e si scarica in PDF con «Stampa / Salva PDF». Pubblica: la apre anche il cliente.
 */
export default async function SchedaProdotto({ params }: { params: Promise<{ tipologia: string }> }) {
  const { tipologia: t } = await params;
  const tipologia = decodeURIComponent(t);
  const m = await prisma.modelloProdotto.findFirst({ where: { tipologia }, select: { descrizioneTecnica: true, immagineUrl: true, gruppo: true, famiglia: true } });
  if (!m || (!m.descrizioneTecnica && !m.immagineUrl)) notFound();
  // colori/varianti disponibili (solo i nomi)
  const colori = (await prisma.prodotto.findMany({ where: { tipologia }, select: { colore: true }, distinct: ["colore"], take: 40 })).map((x) => x.colore).filter((c) => c && !/^STANDARD$/i.test(c));
  const righe = (m.descrizioneTecnica ?? "").split(/\n+| — /).map((x) => x.trim()).filter(Boolean);
  const immagine = m.immagineUrl && !m.immagineUrl.startsWith("data:") ? m.immagineUrl : null;
  return (
    <main className="mx-auto max-w-3xl bg-white p-6 text-neutral-900 print:p-0">
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <span className="text-xs text-neutral-500">Scheda del prodotto</span>
        <BottoneStampa />
      </div>
      <header className="border-b-2 border-amber-500 pb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{m.gruppo ?? m.famiglia ?? "Scheda prodotto"}</p>
        <h1 className="text-2xl font-black">{labelBreveTipologia(tipologia)}</h1>
      </header>
      {immagine && <img src={immagine} alt={tipologia} className="my-4 max-h-96 w-full rounded object-contain" />}
      {righe.length > 0 && (
        <section className="my-4">
          <h2 className="mb-1 text-sm font-bold uppercase text-neutral-700">Caratteristiche</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">{righe.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </section>
      )}
      {colori.length > 0 && (
        <section className="my-4">
          <h2 className="mb-1 text-sm font-bold uppercase text-neutral-700">Colori e varianti</h2>
          <p className="text-sm">{colori.join(" · ")}</p>
        </section>
      )}
      <footer className="mt-8 border-t border-neutral-300 pt-3 text-xs text-neutral-600">
        {CEDENTE.denominazione} · {CEDENTE.indirizzo} {CEDENTE.numeroCivico}, {CEDENTE.cap} {CEDENTE.comune} · P.IVA {CEDENTE.partitaIva} · {CEDENTE.telefono} · {CEDENTE.email}
        <br />Le caratteristiche sono indicative; fa fede l&apos;offerta confermata.
      </footer>
    </main>
  );
}
