export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { listinoDiTipologia } from "@/lib/prodotti";
import { applicaAumento, annullaAumento } from "@/app/listini-actions";
import { ARROTONDAMENTI, aumenta, chiaveListino, leggiPercentuale, listiniOptional, testoPercentuale, type Arrotondamento } from "@/lib/listini/aumenti";

type P = { brand?: string; fornitore?: string; famiglia?: string; q?: string; perc?: string; arr?: string; fatto?: string; annullato?: string; errore?: string };
const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";
const euro = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const ERRORI: Record<string, string> = {
  percentuale: "Scrivi la percentuale di aumento (es. 3,5). Per un ribasso usa il meno (es. -2).",
  vuoto: "Seleziona almeno un listino (o gli articoli del fornitore).",
  permesso: "Solo l'amministratore può applicare gli aumenti.",
};

/** Aumenti listini: il fornitore manda la percentuale, qui la si applica a tutti i suoi listini in un colpo. */
export default async function AumentiListiniPage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u || u.ruolo !== "AMMINISTRATORE") notFound();
  const p = await searchParams;
  const perc = leggiPercentuale(p.perc);
  const arr = (ARROTONDAMENTI.some((a) => a.chiave === p.arr) ? p.arr : "CENTESIMI") as Arrotondamento;

  const [brands, fornitori, modelli, griglie, optionalPerListino, storico] = await Promise.all([
    prisma.brand.findMany({ orderBy: { nome: "asc" } }),
    prisma.soggetto.findMany({ where: { ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" }, select: { id: true, ragioneSociale: true, _count: { select: { articoli: { where: { attivo: true } } } } } }),
    prisma.modelloProdotto.findMany({ select: { brandId: true, tipologia: true, famiglia: true, gruppo: true, fornitoreId: true } }),
    prisma.prodotto.groupBy({ by: ["brandId", "tipologia"], _count: { _all: true }, _min: { prezzoBase: true }, _max: { prezzoBase: true } }),
    prisma.optional.groupBy({ by: ["brandId", "listino"], where: { tipoPrezzo: { not: "PERCENTUALE" }, listino: { not: null } }, _count: { _all: true } }),
    prisma.aumentoListino.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, createdAt: true, utenteNome: true, percentuale: true, descrizione: true, listini: true, prezzi: true, optional: true, articoli: true, nota: true, annullatoIl: true, annullatoDa: true } }),
  ]);
  const modello = new Map(modelli.map((m) => [chiaveListino(m.brandId, m.tipologia), m]));
  const nomeBrand = (id: string) => brands.find((b) => b.id === id)?.nome ?? "?";
  const nomeFornitore = (id?: string | null) => fornitori.find((f) => f.id === id)?.ragioneSociale;
  const optionalDi = (brandId: string, tipologia: string) => {
    const codici = new Set(listiniOptional([tipologia], listinoDiTipologia));
    return optionalPerListino.filter((o) => o.brandId === brandId && o.listino && codici.has(o.listino)).reduce((t, o) => t + o._count._all, 0);
  };

  // Listini (modelli con griglia prezzi) che corrispondono ai filtri
  const famiglie = [...new Set(modelli.map((m) => m.famiglia ?? m.gruppo).filter((x): x is string => !!x))].sort();
  const filtroAttivo = Boolean(p.fornitore || p.famiglia || p.q || (p.brand && p.brand !== "tutti"));
  const listini = griglie
    .map((g) => ({ ...g, chiave: chiaveListino(g.brandId, g.tipologia), m: modello.get(chiaveListino(g.brandId, g.tipologia)) }))
    .filter((l) => !p.brand || p.brand === "tutti" || l.brandId === p.brand)
    .filter((l) => !p.fornitore || (p.fornitore === "nessuno" ? !l.m?.fornitoreId : l.m?.fornitoreId === p.fornitore))
    .filter((l) => !p.famiglia || (l.m?.famiglia ?? l.m?.gruppo) === p.famiglia)
    .filter((l) => !p.q || l.tipologia.toLowerCase().includes(p.q.toLowerCase()))
    .sort((a, b) => nomeBrand(a.brandId).localeCompare(nomeBrand(b.brandId)) || a.tipologia.localeCompare(b.tipologia));
  const totPrezzi = listini.reduce((t, l) => t + l._count._all, 0);
  const totOptional = listini.reduce((t, l) => t + optionalDi(l.brandId, l.tipologia), 0);
  const fornitoreScelto = p.fornitore && p.fornitore !== "nessuno" ? fornitori.find((f) => f.id === p.fornitore) : undefined;
  const ritorno = `/prodotti/aumenti?${new URLSearchParams(Object.entries({ brand: p.brand, fornitore: p.fornitore, famiglia: p.famiglia, q: p.q, perc: p.perc, arr: p.arr }).filter(([, v]) => v) as [string, string][])}`;
  const fatto = p.fatto ? storico.find((s) => s.id === p.fatto) : undefined;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl">
      <div>
        <Link href="/prodotti" className="text-sm text-blue-800 underline">← Prodotti & listini</Link>
        <h1 className="text-2xl font-bold text-neutral-900">📈 Aumenti listini</h1>
        <p className="text-sm text-neutral-600">
          Quando un fornitore comunica un aumento, scegli i suoi listini, scrivi la percentuale e applicala in un colpo a:
          griglie di prezzo a misura, optional e accessori a prezzo fisso del listino, articoli a pezzo del fornitore.
          Gli optional in percentuale si aggiornano da soli. Le offerte già fatte non cambiano. Ogni aumento si può annullare.
        </p>
      </div>

      {p.errore && ERRORI[p.errore] && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{ERRORI[p.errore]}</p>}
      {fatto && (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
          ✅ Aumento applicato: <b>{fatto.descrizione}</b> — {fatto.prezzi} prezzi di griglia, {fatto.optional} optional, {fatto.articoli} articoli aggiornati.
        </p>
      )}
      {p.annullato && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">↩️ Aumento annullato: i prezzi sono tornati quelli di prima.</p>}

      {/* Passo 1: quali listini e di quanto */}
      <form method="get" className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
        <p className="font-semibold text-neutral-900">1. Fornitore, listini e percentuale</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-sm">Fornitore
            <select name="fornitore" defaultValue={p.fornitore ?? ""} className={`${inp} w-full`}>
              <option value="">Tutti i fornitori</option>
              {fornitori.filter((f) => modelli.some((m) => m.fornitoreId === f.id) || f._count.articoli > 0).map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
              <option value="nessuno">Modelli senza fornitore assegnato</option>
            </select>
          </label>
          <label className="text-sm">Marchio
            <select name="brand" defaultValue={p.brand ?? "tutti"} className={`${inp} w-full`}>
              <option value="tutti">Tutti i marchi</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </label>
          <label className="text-sm">Famiglia
            <select name="famiglia" defaultValue={p.famiglia ?? ""} className={`${inp} w-full`}>
              <option value="">Tutte</option>
              {famiglie.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="text-sm">Cerca modello
            <input name="q" defaultValue={p.q ?? ""} placeholder="es. BRILLANTE" className={`${inp} w-full`} />
          </label>
          <label className="text-sm">Aumento %
            <input name="perc" defaultValue={p.perc ?? ""} placeholder="es. 3,5 (ribasso: -2)" inputMode="decimal" className={`${inp} w-full`} />
          </label>
          <label className="text-sm">Arrotonda i prezzi
            <select name="arr" defaultValue={arr} className={`${inp} w-full`}>
              {ARROTONDAMENTI.map((a) => <option key={a.chiave} value={a.chiave}>{a.nome}</option>)}
            </select>
          </label>
        </div>
        <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Mostra anteprima</button>
      </form>

      {/* Passo 2: anteprima e conferma */}
      <form action={applicaAumento} className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
        <input type="hidden" name="percentuale" value={p.perc ?? ""} />
        <input type="hidden" name="arrotondamento" value={arr} />
        <input type="hidden" name="ritorno" value={ritorno} />
        <p className="font-semibold text-neutral-900">
          2. Anteprima: {listini.length} listini · {totPrezzi} prezzi di griglia · {totOptional} optional a prezzo fisso
          {perc !== null && <span className="ml-2 text-blue-800">({testoPercentuale(perc)}, arrotondati {ARROTONDAMENTI.find((a) => a.chiave === arr)?.nome})</span>}
        </p>
        {!filtroAttivo && <p className="text-xs text-neutral-600">Nessun filtro scelto: i listini sono tutti deselezionati. Scegli un fornitore (o un marchio/famiglia) sopra, oppure spunta a mano.</p>}
        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto border border-neutral-200 rounded">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 sticky top-0">
              <tr className="text-left text-neutral-600">
                <th className="px-2 py-1.5">✓</th><th className="px-2 py-1.5">Marchio</th><th className="px-2 py-1.5">Modello</th><th className="px-2 py-1.5">Famiglia</th>
                <th className="px-2 py-1.5">Fornitore</th><th className="px-2 py-1.5 text-right">Prezzi</th><th className="px-2 py-1.5 text-right">Optional</th>
                <th className="px-2 py-1.5 text-right">Da … a (oggi)</th>{perc !== null && <th className="px-2 py-1.5 text-right">Dopo l&apos;aumento</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {listini.map((l) => (
                <tr key={l.chiave}>
                  <td className="px-2 py-1"><input type="checkbox" name="listino" value={l.chiave} defaultChecked={filtroAttivo} /></td>
                  <td className="px-2 py-1">{nomeBrand(l.brandId)}</td>
                  <td className="px-2 py-1 font-medium">{l.tipologia}</td>
                  <td className="px-2 py-1 text-neutral-600">{l.m?.famiglia ?? l.m?.gruppo ?? "—"}</td>
                  <td className="px-2 py-1 text-neutral-600">{nomeFornitore(l.m?.fornitoreId) ?? "—"}</td>
                  <td className="px-2 py-1 text-right">{l._count._all}</td>
                  <td className="px-2 py-1 text-right">{optionalDi(l.brandId, l.tipologia) || ""}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{euro(l._min.prezzoBase ?? 0)} … {euro(l._max.prezzoBase ?? 0)}</td>
                  {perc !== null && <td className="px-2 py-1 text-right whitespace-nowrap text-blue-800">{euro(aumenta(l._min.prezzoBase ?? 0, perc, arr))} … {euro(aumenta(l._max.prezzoBase ?? 0, perc, arr))}</td>}
                </tr>
              ))}
              {listini.length === 0 && <tr><td colSpan={9} className="px-2 py-4 text-neutral-600">Nessun listino con questi filtri.</td></tr>}
            </tbody>
          </table>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="conOptional" defaultChecked /> Aumenta anche gli optional e accessori a prezzo fisso dei listini selezionati
        </label>
        {fornitoreScelto && fornitoreScelto._count.articoli > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="fornitoreArticoli" value={fornitoreScelto.id} defaultChecked /> Aumenta anche i {fornitoreScelto._count.articoli} articoli a pezzo di {fornitoreScelto.ragioneSociale} (listino o costo; la vendita si ricalcola con le regole della categoria, quella fissata a mano resta)
          </label>
        )}
        <label className="text-sm block">Nota (es. &quot;comunicazione del fornitore del 01/11/2026&quot;)
          <input name="nota" className={`${inp} w-full`} />
        </label>
        {perc === null ? (
          <p className="text-sm text-neutral-600">Scrivi la percentuale al passo 1 e premi &quot;Mostra anteprima&quot; per poter applicare l&apos;aumento.</p>
        ) : (
          <button className="btn-3d btn-3d-orange text-sm px-4 py-2">Applica {testoPercentuale(perc)} ai listini spuntati</button>
        )}
      </form>

      {/* Storico */}
      <div className="card-fase bg-white rounded-lg border border-neutral-200 p-4">
        <p className="font-semibold text-neutral-900 mb-2">Storico aumenti</p>
        {storico.length === 0 && <p className="text-sm text-neutral-600">Nessun aumento ancora applicato.</p>}
        <div className="divide-y divide-neutral-100">
          {storico.map((s) => (
            <div key={s.id} className={`flex flex-wrap items-start justify-between gap-2 py-2 text-sm ${s.annullatoIl ? "opacity-60" : ""}`}>
              <div>
                <p className="font-medium">{s.descrizione}{s.annullatoIl && <span className="ml-2 text-xs text-amber-800">annullato il {s.annullatoIl.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} da {s.annullatoDa}</span>}</p>
                <p className="text-xs text-neutral-600">
                  {s.createdAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {s.utenteNome ?? "—"} ·
                  {" "}{s.prezzi} prezzi, {s.optional} optional, {s.articoli} articoli{s.nota ? ` · ${s.nota}` : ""}
                </p>
                {s.listini.length > 0 && <p className="text-xs text-neutral-500">{s.listini.slice(0, 12).join(", ")}{s.listini.length > 12 ? ` e altri ${s.listini.length - 12}` : ""}</p>}
              </div>
              {!s.annullatoIl && (
                <form action={annullaAumento}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn-3d btn-3d-outline text-xs px-3 py-1">↩️ Annulla</button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
