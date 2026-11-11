export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { salvaModelloProdotto, salvaPrezzoProdotto } from "@/app/actions";
import { listinoDiTipologia, haMisura } from "@/lib/prodotti";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { aggiungiComponenteKit, eliminaComponenteKit } from "@/app/kit-actions";
import { CALCOLI_KIT, labelCalcolo } from "@/lib/listini/kit";

export default async function ModelloProdottoPage({
  params,
  searchParams,
}: {
  params: Promise<{ tipologia: string }>;
  searchParams: Promise<{ kitOk?: string; kitErrore?: string }>;
}) {
  const { tipologia: tipologiaParam } = await params;
  const { kitOk, kitErrore } = await searchParams;
  const tipologia = decodeURIComponent(tipologiaParam);

  const primoProdotto = await prisma.prodotto.findFirst({ where: { tipologia }, include: { brand: true } });
  if (!primoProdotto) notFound();

  const [varianti, modello] = await Promise.all([
    prisma.prodotto.count({ where: { tipologia } }),
    prisma.modelloProdotto.findUnique({
      where: { brandId_tipologia: { brandId: primoProdotto.brandId, tipologia } },
    }),
  ]);

  // Distinta base (kit): pezzi da ordinare insieme al prodotto, solo acquisto
  const utente = await getCurrentUser();
  const puoKit = puo(utente, "listini.modifica");
  const [kit, fornitoriKit, articoliKit] = await Promise.all([
    prisma.componenteKit.findMany({ where: { brandId: primoProdotto.brandId, tipologia }, orderBy: [{ ordine: "asc" }, { createdAt: "asc" }] }),
    prisma.soggetto.findMany({ where: { ruoli: { has: "FORNITORE" }, attivo: true }, select: { id: true, ragioneSociale: true }, orderBy: { ragioneSociale: "asc" } }),
    puoKit ? prisma.articolo.findMany({ where: { attivo: true }, select: { codice: true, descrizione: true }, orderBy: { codice: "asc" }, take: 3000 }) : Promise.resolve([]),
  ]);
  const nomeFornitore = new Map(fornitoriKit.map((f) => [f.id, f.ragioneSociale]));

  // Cataloghi "a nome" (senza misura, es. Hisense, Lamborghini, Motori Cherubini): mostra
  // l'elenco delle varianti con prezzo modificabile una per una, direttamente da qui.
  const senzaMisura = !haMisura(primoProdotto.altezzaMm, primoProdotto.larghezzaMm);
  const variantiPrezzo = senzaMisura
    ? await prisma.prodotto.findMany({
        where: { tipologia },
        orderBy: { colore: "asc" },
        select: { id: true, colore: true, prezzoBase: true, descrizione: true },
      })
    : [];

  // Pannelli/optional con immagine applicabili a questa scheda (stesso filtro usato in
  // preventivi per popolare il menu a tendina): listino a livello di famiglia/tipologia,
  // gruppo merceologico corrispondente. Raggruppati per categoria, una miniatura ciascuna
  // (molte righe della stessa categoria — es. le varie essenze di uno stesso modello di
  // pannello — condividono la stessa immagine di riferimento).
  const listino = listinoDiTipologia(tipologia);
  const optionaliConImmagine = modello?.gruppo
    ? await prisma.optional.findMany({
        where: {
          brandId: primoProdotto.brandId,
          gruppiApplicabili: { has: modello.gruppo },
          immagineUrl: { not: null },
          OR: [{ listino: null }, { listino }, { listino: tipologia }],
        },
        orderBy: [{ categoria: "asc" }],
      })
    : [];
  const categorieUniche = new Map<string, { categoria: string; immagineUrl: string; count: number }>();
  for (const o of optionaliConImmagine) {
    if (!o.immagineUrl) continue;
    const chiave = modello?.gruppo === "PAVIMENTI" ? o.immagineUrl : o.categoria;
    const esistente = categorieUniche.get(chiave);
    if (esistente) esistente.count++;
    else categorieUniche.set(chiave, { categoria: modello?.gruppo === "PAVIMENTI" ? o.nome : o.categoria, immagineUrl: o.immagineUrl, count: 1 });
  }
  const galleriaPannelli = [...categorieUniche.values()];

  return (
    <div className="max-w-2xl">
      <Link href="/prodotti" className="text-xs text-neutral-600 hover:underline">
        ← Prodotti &amp; listini
      </Link>
      <h1 className="text-2xl font-bold text-neutral-900 mt-2 mb-1">{tipologia.replace(/_/g, " ")}</h1>
      <p className="text-sm text-neutral-600 mb-6">
        {primoProdotto.brand.nome} · {varianti} varianti dimensionali collegate a questa scheda
      </p>

      {modello?.immagineUrl && (
        <img
          src={modello.immagineUrl}
          alt={tipologia}
          className="w-full max-h-80 object-cover rounded-lg border border-neutral-200 mb-4"
        />
      )}

      <form action={salvaModelloProdotto} className="bg-white rounded-lg border border-neutral-200 p-4 flex flex-col gap-3">
        <input type="hidden" name="brandId" value={primoProdotto.brandId} />
        <input type="hidden" name="tipologia" value={tipologia} />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-700">URL immagine</label>
          <input
            name="immagineUrl"
            defaultValue={modello?.immagineUrl ?? ""}
            placeholder="https://..."
            className="border border-neutral-200 rounded px-2 py-1.5 text-sm"
          />
          <p className="text-[11px] text-neutral-500">
            Incolla il link di un&apos;immagine già online (es. da Google Drive con condivisione pubblica, o da un tuo sito). Il caricamento diretto di file non è ancora supportato.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-700">Descrizione tecnica</label>
          <textarea
            name="descrizioneTecnica"
            defaultValue={modello?.descrizioneTecnica ?? ""}
            rows={6}
            className="border border-neutral-200 rounded px-2 py-1.5 text-sm"
            placeholder="Materiali, finiture, caratteristiche tecniche da mostrare in offerta..."
          />
        </div>
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-neutral-700">Famiglia</label>
            <select name="famiglia" defaultValue={modello?.famiglia ?? ""} className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
              <option value="">—</option>
              <option value="OUTDOOR">Outdoor</option>
              <option value="INDOOR">Indoor</option>
              <option value="SERVIZI">Servizi e pratiche</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-neutral-700">Gruppo</label>
            <input
              name="gruppo"
              defaultValue={modello?.gruppo ?? ""}
              placeholder="es. Pergole, Serramenti, Zanzariere..."
              className="border border-neutral-200 rounded px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <input type="hidden" name="conProvvigione" value="1" />
        <label className="flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm">
          <input type="checkbox" name="inProvvigione" value="1" defaultChecked={modello?.inProvvigione ?? true} className="mt-1" />
          <span><b>Va in provvigione</b><span className="block text-[11px] text-neutral-600">Togli la spunta per i servizi e le pratiche a costo netto (es. pratica ENEA, autoscala, facchinaggio): il loro importo si toglie dall&apos;imponibile su cui il commerciale prende la percentuale.</span></span>
        </label>
        <button className="btn-3d btn-3d-dark text-sm px-4 py-2 self-start">Salva scheda</button>
      </form>

      {senzaMisura && variantiPrezzo.length > 0 && (
        <div className="mt-6 bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-base font-bold text-neutral-900 mb-1">
            Prezzi ({variantiPrezzo.length} varianti)
          </h2>
          <p className="text-xs text-neutral-600 mb-3">
            Prodotto senza misura: inserisci o correggi il prezzo di ciascuna variante singolarmente.
          </p>
          <div className="flex flex-col gap-2">
            {variantiPrezzo.map((v) => (
              <form
                key={v.id}
                action={salvaPrezzoProdotto}
                className="flex items-center gap-2 border border-neutral-100 rounded px-2 py-1.5"
              >
                <input type="hidden" name="prodottoId" value={v.id} />
                <input type="hidden" name="tipologia" value={tipologia} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-900 truncate">{v.colore}</p>
                  {v.descrizione && <p className="text-[11px] text-neutral-500 truncate">{v.descrizione}</p>}
                </div>
                <span className="text-xs text-neutral-500">€</span>
                <input
                  name="prezzoBase"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={v.prezzoBase}
                  className="border border-neutral-200 rounded px-2 py-1 text-sm w-28 text-right"
                />
                <button className="btn-3d btn-3d-dark text-xs px-3 py-1.5">Salva</button>
              </form>
            ))}
          </div>
        </div>
      )}

      <section id="kit" className="mt-6 bg-white rounded-lg border border-neutral-200 p-4 scroll-mt-4">
        <h2 className="text-base font-bold text-neutral-900 mb-1">🔗 Distinta base / prodotti correlati (kit)</h2>
        <p className="text-xs text-neutral-600 mb-3">I pezzi che vanno ordinati insieme a questo prodotto (es. angolari e legni per la vetrata, i componenti del kit tapparella).
          Quando il prodotto entra nel materiale di un progetto, i pezzi «sempre» si aggiungono da soli; i «facoltativi» vengono proposti. Solo acquisto: il prezzo al cliente non cambia.</p>
        {kitOk && <p className="text-xs text-green-900 bg-green-50 border border-green-200 rounded px-2 py-1 mb-2">✅ {kitOk}</p>}
        {kitErrore && <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1 mb-2">{kitErrore}</p>}
        {kit.length === 0 ? <p className="text-sm text-neutral-500 mb-3">Nessun pezzo nella distinta base.</p> : (
          <table className="w-full text-sm mb-3">
            <thead><tr className="text-left text-xs text-neutral-600 border-b border-neutral-200"><th className="py-1">Pezzo</th><th className="text-right pr-3">Q.tà</th><th>Come si conta</th><th>Fornitore</th><th className="text-right pr-3">Costo unit.</th><th>Tipo</th><th></th></tr></thead>
            <tbody>
              {kit.map((c) => (
                <tr key={c.id} className="border-b border-neutral-100">
                  <td className="py-1.5">{c.descrizione}</td>
                  <td className="py-1.5 text-right pr-3">{String(c.quantita).replace(".", ",")}</td>
                  <td className="py-1.5 text-xs">{labelCalcolo(c.calcolo)}</td>
                  <td className="py-1.5 text-xs">{c.fornitoreId ? nomeFornitore.get(c.fornitoreId) ?? "—" : "quello del modello"}</td>
                  <td className="py-1.5 text-right pr-3 text-xs">{c.costoUnitario !== null ? c.costoUnitario.toLocaleString("it-IT", { style: "currency", currency: "EUR" }) : "—"}</td>
                  <td className="py-1.5 text-xs">{c.facoltativo ? <span className="px-1.5 rounded bg-amber-100 text-amber-900 font-bold">facoltativo</span> : <span className="px-1.5 rounded bg-teal-100 text-teal-900 font-bold">sempre</span>}</td>
                  <td className="py-1.5 text-right">{puoKit && <form action={eliminaComponenteKit}><input type="hidden" name="id" value={c.id} /><button className="text-xs text-red-700 underline">togli</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {puoKit && (
          <form action={aggiungiComponenteKit} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end border-t border-neutral-200 pt-3">
            <input type="hidden" name="brandId" value={primoProdotto.brandId} />
            <input type="hidden" name="tipologia" value={tipologia} />
            <label className="text-xs font-semibold md:col-span-4">Articolo del magazzino (facoltativo)
              <input name="articolo" list="kit-articoli" placeholder="codice o descrizione…" className="border border-neutral-300 rounded px-2 py-1 text-sm w-full" /></label>
            <datalist id="kit-articoli">{articoliKit.map((a) => <option key={a.codice} value={`${a.codice} — ${a.descrizione}`} />)}</datalist>
            <label className="text-xs font-semibold col-span-2 md:col-span-8">Descrizione del pezzo
              <input name="descrizione" placeholder="es. Angolare in alluminio 40×40, Legno di finitura, Cassonetto…" className="border border-neutral-300 rounded px-2 py-1 text-sm w-full" /></label>
            <label className="text-xs font-semibold md:col-span-1">Q.tà<input name="quantita" defaultValue="1" inputMode="decimal" className="border border-neutral-300 rounded px-2 py-1 text-sm w-full" /></label>
            <label className="text-xs font-semibold md:col-span-3">Come si conta
              <select name="calcolo" className="border border-neutral-300 rounded px-2 py-1 text-sm w-full">{CALCOLI_KIT.map((c) => <option key={c.valore} value={c.valore}>{c.label}</option>)}</select></label>
            <label className="text-xs font-semibold md:col-span-3">Fornitore
              <select name="fornitoreId" className="border border-neutral-300 rounded px-2 py-1 text-sm w-full"><option value="">quello del modello / articolo</option>{fornitoriKit.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}</select></label>
            <label className="text-xs font-semibold md:col-span-2">Costo unit. €<input name="costoUnitario" inputMode="decimal" placeholder="facoltativo" className="border border-neutral-300 rounded px-2 py-1 text-sm w-full" /></label>
            <label className="text-xs font-semibold md:col-span-3 flex items-center gap-1.5 pb-1"><input type="checkbox" name="facoltativo" /> facoltativo (solo proposto)</label>
            <div className="col-span-2 md:col-span-12"><button className="btn-3d btn-3d-teal text-sm px-4 py-1.5">➕ Aggiungi alla distinta base</button></div>
          </form>
        )}
      </section>

      {galleriaPannelli.length > 0 && (
        <div className="mt-6">
          <h2 className="text-base font-bold text-neutral-900 mb-1">
            Pannelli / disegni disponibili ({galleriaPannelli.length} categorie a listino)
          </h2>
          <p className="text-xs text-neutral-600 mb-3">
            Anteprima delle pagine catalogo fornitore corrispondenti — utile per mostrare le opzioni al cliente prima di scegliere l&apos;optional in offerta.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {galleriaPannelli.map((g) => (
              <div key={g.categoria} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                <img src={g.immagineUrl} alt={g.categoria} className="w-full h-40 object-cover object-top" />
                <div className="px-2 py-1.5">
                  <p className="text-[11px] font-medium text-neutral-700 leading-tight">{g.categoria}</p>
                  {g.count > 1 && <p className="text-[10px] text-neutral-600">{g.count} varianti a listino</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
