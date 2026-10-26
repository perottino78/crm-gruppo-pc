export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { sincronizzaScadenzeCommesse, residuoScadenza } from "@/lib/amministrazione/server";
import { whereScadenze, oggiUtc, type ParametriScadenze } from "@/lib/amministrazione/filtri";
import { cent } from "@/lib/amministrazione/estratto";
import { eur, dataIt, STATI_SCADENZA } from "@/lib/amministrazione/costanti";
import { nuovaScadenza, modificaScadenza, saldaManualmente, annullaScadenza } from "@/app/amministrazione-actions";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white";

export default async function ScadenzarioPage({ searchParams }: { searchParams: Promise<ParametriScadenze> }) {
  const p = await searchParams;
  await sincronizzaScadenzeCommesse();
  const oggi = oggiUtc();
  const [scadenze, fornitori] = await Promise.all([
    prisma.scadenza.findMany({
      where: whereScadenze(p),
      include: { abbinamenti: { include: { movimento: { include: { conto: { select: { nome: true } } } } } } },
      orderBy: [{ dataScadenza: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 1000,
    }),
    prisma.soggetto.findMany({ where: { attivo: true }, select: { id: true, ragioneSociale: true }, orderBy: { ragioneSociale: "asc" } }),
  ]);
  const righe = scadenze.map((s) => ({ ...s, residuo: residuoScadenza(s), scaduta: !!s.dataScadenza && s.dataScadenza < oggi && ["APERTA", "PARZIALE"].includes(s.stato) }));
  const tot = (tipo: string) => cent(righe.filter((r) => r.tipo === tipo && r.stato !== "ANNULLATA").reduce((t, r) => t + r.residuo, 0));
  const daIncassare = tot("INCASSO"), daPagare = tot("PAGAMENTO");

  // raggruppamento per mese
  const gruppi = new Map<string, typeof righe>();
  for (const r of righe) {
    const k = r.dataScadenza ? r.dataScadenza.toISOString().slice(0, 7) : "senza-data";
    gruppi.set(k, [...(gruppi.get(k) ?? []), r]);
  }
  const nomeMese = (k: string) => k === "senza-data" ? "Senza data (es. saldi da incassare prima della posa)" : new Date(`${k}-15T12:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const qs = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const tutti = { tipo: p.tipo, periodo: p.periodo, stato: p.stato, q: p.q, ...extra };
    Object.entries(tutti).forEach(([k, v]) => v && u.set(k, v));
    return `?${u.toString()}`;
  };
  const pill = (attivo: boolean) => `px-3 py-1 rounded-full text-xs font-semibold border ${attivo ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"}`;
  const periodi: [string, string][] = [["tutte", "Tutte"], ["scadute", "Scadute"], ["oggi", "Entro oggi"], ["settimana", "Settimana"], ["mese", "Mese corrente"], ["30", "Prossimi 30 gg"], ["90", "Prossimi 3 mesi"], ["senza-data", "Senza data"]];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {[["", "Incassi e pagamenti"], ["INCASSO", "Solo incassi"], ["PAGAMENTO", "Solo pagamenti"]].map(([v, l]) => (
          <Link key={v} href={qs({ tipo: v || undefined })} className={pill((p.tipo ?? "") === v)}>{l}</Link>
        ))}
        <span className="w-px h-5 bg-neutral-300 mx-1" />
        {[["aperte", "Da saldare"], ["pagate", "Saldate"], ["annullate", "Annullate"], ["tutte", "Tutti gli stati"]].map(([v, l]) => (
          <Link key={v} href={qs({ stato: v })} className={pill((p.stato ?? "aperte") === v)}>{l}</Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {periodi.map(([v, l]) => <Link key={v} href={qs({ periodo: v })} className={pill((p.periodo ?? "tutte") === v)}>{l}</Link>)}
        <form className="ml-auto flex gap-2">
          {p.tipo && <input type="hidden" name="tipo" value={p.tipo} />}
          {p.periodo && <input type="hidden" name="periodo" value={p.periodo} />}
          {p.stato && <input type="hidden" name="stato" value={p.stato} />}
          <input name="q" defaultValue={p.q} placeholder="Cerca cliente, fornitore, n° doc…" className={`${inp} w-64`} />
          <button className="btn-3d btn-3d-dark text-xs px-3">Cerca</button>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tot titolo="Da incassare (filtro attuale)" valore={daIncassare} cls="text-green-700" />
        <Tot titolo="Da pagare (filtro attuale)" valore={daPagare} cls="text-orange-700" />
        <Tot titolo="Differenza" valore={cent(daIncassare - daPagare)} cls={daIncassare - daPagare < 0 ? "text-red-600" : "text-neutral-900"} />
      </div>

      <div className="flex flex-wrap gap-2">
        <details className="bg-white border border-neutral-200 rounded-lg p-3 flex-1 min-w-[300px]">
          <summary className="cursor-pointer font-semibold text-sm">➕ Nuova scadenza (fattura fornitore, F24, rata, incasso extra…)</summary>
          <form action={nuovaScadenza} className="grid md:grid-cols-4 gap-2 mt-3">
            <select name="tipo" className={inp}><option value="PAGAMENTO">Da pagare</option><option value="INCASSO">Da incassare</option></select>
            <input name="controparte" list="elenco-soggetti" required placeholder="Fornitore / cliente *" className={`${inp} md:col-span-2`} />
            <datalist id="elenco-soggetti">{fornitori.map((f) => <option key={f.id} value={f.ragioneSociale} />)}</datalist>
            <input name="numeroDocumento" placeholder="N° fattura / documento" className={inp} />
            <input name="descrizione" required placeholder="Descrizione *" className={`${inp} md:col-span-2`} />
            <input name="importo" required inputMode="decimal" placeholder="Importo € (IVA incl.) *" className={inp} />
            <input name="dataScadenza" type="date" className={inp} title="Prima scadenza" />
            <input name="rate" type="number" min="1" max="24" defaultValue="1" className={inp} title="Numero di rate mensili" />
            <input name="categoria" placeholder="Categoria (es. Fornitori, Utenze)" className={inp} />
            <input name="note" placeholder="Note" className={`${inp} md:col-span-2`} />
            <p className="text-[11px] text-neutral-500 md:col-span-3 self-center">Con più rate l&apos;importo viene diviso in scadenze mensili a partire dalla data indicata.</p>
            <button className="btn-3d btn-3d-green text-sm">Salva scadenza</button>
          </form>
        </details>
        <a href={`/api/amministrazione/export${qs({ vista: "scadenze" })}`} className="btn-3d btn-3d-outline text-sm px-4 self-start py-2">⬇ Esporta in Excel</a>
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-600">
            <tr>
              <th className="text-left px-3 py-2">Scadenza</th><th className="text-left px-3 py-2">Tipo</th><th className="text-left px-3 py-2">Controparte</th>
              <th className="text-left px-3 py-2">Descrizione</th><th className="text-right px-3 py-2">Importo</th><th className="text-right px-3 py-2">Da saldare</th>
              <th className="text-left px-3 py-2">Stato</th><th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {righe.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-neutral-500">Nessuna scadenza con questi filtri.</td></tr>}
            {[...gruppi.entries()].map(([k, g]) => (
              <Gruppo key={k} titolo={nomeMese(k)} righe={g} />
            ))}
          </tbody>
        </table>
      </div>
      {righe.length >= 1000 && <p className="text-xs text-neutral-500">Mostrate le prime 1000 scadenze: restringi i filtri.</p>}
    </div>
  );
}

type Riga = Awaited<ReturnType<typeof prisma.scadenza.findMany>>[number] & {
  residuo: number; scaduta: boolean;
  abbinamenti: { id: string; importo: number; movimento: { data: Date; descrizione: string; conto: { nome: string } } }[];
};

function Gruppo({ titolo, righe }: { titolo: string; righe: Riga[] }) {
  const inc = cent(righe.filter((r) => r.tipo === "INCASSO").reduce((t, r) => t + r.residuo, 0));
  const pag = cent(righe.filter((r) => r.tipo === "PAGAMENTO").reduce((t, r) => t + r.residuo, 0));
  return (
    <>
      <tr className="bg-neutral-100 border-t border-neutral-200">
        <td colSpan={8} className="px-3 py-1.5 text-xs font-bold text-neutral-700 capitalize">
          {titolo} <span className="font-normal normal-case text-neutral-600">· da incassare {eur(inc)} · da pagare {eur(pag)}</span>
        </td>
      </tr>
      {righe.map((s) => {
        const st = STATI_SCADENZA[s.scaduta ? "SCADUTA" : s.stato] ?? STATI_SCADENZA.APERTA;
        const daCommessa = s.origine !== "MANUALE";
        return (
          <tr key={s.id} className="border-t border-neutral-100 align-top">
            <td className={`px-3 py-2 whitespace-nowrap ${s.scaduta ? "text-red-600 font-bold" : ""}`}>{dataIt(s.dataScadenza)}</td>
            <td className="px-3 py-2">{s.tipo === "INCASSO" ? <span className="text-green-700 font-semibold">Incasso</span> : <span className="text-orange-700 font-semibold">Pagamento</span>}</td>
            <td className="px-3 py-2 font-semibold text-neutral-900">{s.controparte}{s.brand && <span className="block text-[10px] font-normal text-neutral-500">{s.brand}</span>}</td>
            <td className="px-3 py-2 text-neutral-700">
              {s.commessaId ? <Link href={`/commesse/${s.commessaId}`} className="underline">{s.descrizione}</Link> : s.descrizione}
              {s.numeroDocumento && <span className="text-neutral-500"> · doc. {s.numeroDocumento}</span>}
              {s.abbinamenti.map((a) => (
                <span key={a.id} className="block text-[11px] text-green-800">✓ {dataIt(a.movimento.data)} {a.movimento.conto.nome}: {eur(a.importo)}</span>
              ))}
              {s.note && <span className="block text-[11px] text-neutral-500 whitespace-pre-line">{s.note}</span>}
            </td>
            <td className="px-3 py-2 text-right whitespace-nowrap">{eur(s.importo)}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap font-bold">{s.stato === "ANNULLATA" ? "—" : eur(s.residuo)}</td>
            <td className="px-3 py-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span></td>
            <td className="px-3 py-2 text-right">
              {s.stato !== "ANNULLATA" && (
                <details className="relative inline-block text-left">
                  <summary className="cursor-pointer text-xs underline text-neutral-700 list-none">Gestisci</summary>
                  <div className="absolute right-0 z-20 mt-1 w-80 bg-white border border-neutral-300 rounded-lg shadow-lg p-3 space-y-3">
                    <form action={modificaScadenza} className="space-y-1.5">
                      <input type="hidden" name="id" value={s.id} />
                      <label className="block text-[11px] font-semibold">Data scadenza
                        <input type="date" name="dataScadenza" defaultValue={s.dataScadenza?.toISOString().slice(0, 10)} className={`${inp} w-full`} /></label>
                      {!daCommessa && <label className="block text-[11px] font-semibold">Importo €
                        <input name="importo" defaultValue={s.importo.toFixed(2).replace(".", ",")} className={`${inp} w-full`} /></label>}
                      <input name="numeroDocumento" defaultValue={s.numeroDocumento ?? ""} placeholder="N° documento" className={`${inp} w-full`} />
                      <button className="btn-3d btn-3d-blue text-xs w-full">Salva modifiche</button>
                      {daCommessa && <p className="text-[10px] text-neutral-500">L&apos;importo arriva dalla commessa: si cambia lì.</p>}
                    </form>
                    {s.residuo > 0.004 && (
                      <form action={saldaManualmente} className="space-y-1.5 border-t pt-2">
                        <input type="hidden" name="id" value={s.id} />
                        <p className="text-[11px] font-semibold">Saldata fuori dai conti importati</p>
                        <input name="importo" defaultValue={s.residuo.toFixed(2).replace(".", ",")} className={`${inp} w-full`} />
                        <input name="motivo" required placeholder="Come? (contanti, assegno, compensazione…) *" className={`${inp} w-full`} />
                        <button className="btn-3d btn-3d-green text-xs w-full">Segna saldata</button>
                        <p className="text-[10px] text-neutral-500">Se il pagamento è passato in banca, abbinalo invece dalla Prima nota.</p>
                      </form>
                    )}
                    {!daCommessa && s.abbinamenti.length === 0 && s.pagatoManuale === 0 && (
                      <form action={annullaScadenza} className="space-y-1.5 border-t pt-2">
                        <input type="hidden" name="id" value={s.id} />
                        <input name="motivo" required placeholder="Motivo annullamento *" className={`${inp} w-full`} />
                        <button className="btn-3d btn-3d-red text-xs w-full">Annulla scadenza</button>
                      </form>
                    )}
                  </div>
                </details>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function Tot({ titolo, valore, cls }: { titolo: string; valore: number; cls: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{titolo}</p>
      <p className={`text-lg font-extrabold ${cls}`}>{eur(valore)}</p>
    </div>
  );
}
