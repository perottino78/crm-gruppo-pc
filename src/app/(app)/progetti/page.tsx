export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { visibilitaDi } from "@/lib/permessi/catalogo";
import { progettiDi } from "@/lib/progetti/server";
import { filtraProgetti, ordinaProgetti, riepilogoProgetti, semaforoConsegna, percentualePagata, VISTE, type Vista, type Semaforo } from "@/lib/progetti/miei";
import { Stepper } from "@/components/clienti/PraticaCard";
import { STATI_COMMESSA, eur } from "@/lib/commesse";
import { nomeUfficio } from "@/lib/flusso";
import { puoConsegnareKit } from "@/lib/kit/punti";

type P = { vista?: string; q?: string; persona?: string };

const data = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });
const CONSEGNA: Record<Semaforo, { cls: string; parola: string }> = {
  SCADUTA: { cls: "bg-red-100 text-red-800 ring-red-300", parola: "scaduta" },
  VICINA: { cls: "bg-amber-100 text-amber-900 ring-amber-300", parola: "entro 7 giorni" },
  OK: { cls: "bg-green-50 text-green-800 ring-green-200", parola: "nei tempi" },
  NESSUNA: { cls: "bg-neutral-100 text-neutral-600 ring-neutral-200", parola: "da fissare" },
  FINITA: { cls: "bg-neutral-100 text-neutral-700 ring-neutral-200", parola: "consegnato" },
};

export default async function ProgettiPage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const p = await searchParams;
  const oggi = new Date();
  const tutti = await progettiDi(u);
  const soloMiei = visibilitaDi(u) === "PROPRI";
  const persone = [...new Map(tutti.map((x) => [x.commercialeId, x.commerciale])).entries()].sort((a, b) => a[1].localeCompare(b[1], "it"));
  const persona = !soloMiei && p.persona && persone.some(([id]) => id === p.persona) ? p.persona : "";
  const vista: Vista = VISTE.some((v) => v.chiave === p.vista) ? (p.vista as Vista) : "CORSO";
  const diPersona = persona ? tutti.filter((x) => x.commercialeId === persona) : tutti;
  const lista = ordinaProgetti(filtraProgetti(diPersona, vista, p.q ?? ""), oggi);
  const r = riepilogoProgetti(diPersona, oggi);
  const qs = (extra: Partial<P>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ vista: vista === "CORSO" ? undefined : vista, q: p.q, persona: persona || undefined, ...extra })) if (v) s.set(k, v);
    const t = s.toString();
    return t ? `/progetti?${t}` : "/progetti";
  };
  const titolo = soloMiei ? "I miei progetti" : "Progetti dei clienti";
  const tessere: { n: string; label: string; spiega: string; cls: string }[] = [
    { n: String(r.inCorso), label: "In corso", spiega: "pratiche aperte", cls: "border-l-blue-600" },
    { n: String(r.scadute), label: "Consegna scaduta", spiega: "da sollecitare oggi", cls: r.scadute ? "border-l-red-600 bg-red-50" : "border-l-neutral-300" },
    { n: String(r.vicine), label: "Consegna entro 7 giorni", spiega: "avvisa il cliente", cls: r.vicine ? "border-l-amber-500 bg-amber-50" : "border-l-neutral-300" },
    { n: String(r.attesaAcconto), label: "In attesa di acconto", spiega: "la pratica non parte", cls: "border-l-violet-500" },
    { n: eur(r.daIncassare), label: "Da incassare", spiega: "dai clienti in corso", cls: "border-l-emerald-600" },
  ];

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">📁 {titolo}</h1>
          <p className="text-sm text-neutral-600">Dopo la firma: a che punto è ogni pratica, quando si consegna e quanto ha pagato il cliente.</p>
        </div>
        <Link href="/contratti" className="btn-3d btn-3d-outline px-3 py-1.5 text-sm">💼 Contratti e provvigioni</Link>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        {tessere.map((t) => (
          <div key={t.label} className={`rounded-lg border border-neutral-200 border-l-4 bg-white px-3 py-2 ${t.cls}`}>
            <p className="text-xl font-bold text-neutral-900">{t.n}</p>
            <p className="text-xs font-semibold text-neutral-800">{t.label}</p>
            <p className="text-[11px] text-neutral-500">{t.spiega}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex gap-1">
          {VISTE.map((v) => (
            <Link key={v.chiave} href={qs({ vista: v.chiave === "CORSO" ? undefined : v.chiave })}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${vista === v.chiave ? "bg-neutral-900 text-white" : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>
              {v.nome}
            </Link>
          ))}
        </div>
        <form className="flex flex-1 flex-wrap items-end gap-2" action="/progetti">
          {vista !== "CORSO" && <input type="hidden" name="vista" value={vista} />}
          {!soloMiei && persone.length > 1 && (
            <select name="persona" defaultValue={persona} className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
              <option value="">Tutti i commerciali</option>
              {persone.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          )}
          <input name="q" defaultValue={p.q ?? ""} placeholder="Cerca cliente, numero, oggetto…" className="min-w-[200px] flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
          <button className="btn-3d btn-3d-dark px-3 py-1.5 text-sm">Cerca</button>
        </form>
      </div>

      {lista.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          {tutti.length === 0 ? "Ancora nessun progetto: nasce quando il cliente firma e si conferma l’ordine dall’offerta." : "Nessun progetto con questi filtri."}
        </p>
      ) : (
        <div className="space-y-3">
          {lista.map((x) => {
            const sem = semaforoConsegna(x, oggi);
            const perc = percentualePagata(x);
            const st = STATI_COMMESSA[x.stato];
            return (
              <div key={x.id} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-bold text-neutral-900">
                      <Link href={`/clienti/${x.clienteId}?sez=progetti`} className="text-blue-800 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-700">{x.cliente}</Link>
                      {x.kitConsegnato && <span className="ml-1.5 rounded bg-green-100 px-1.5 py-0.5 align-middle text-xs font-semibold text-green-800" title="Kit consegnato: punti nella tua raccolta">✅ 🎁</span>}
                      {x.comune && <span className="font-normal text-neutral-500"> · {x.comune}</span>}
                    </p>
                    <p className="text-xs text-neutral-600">
                      <Link href={`/commesse/${x.id}`} className="font-semibold text-neutral-800 underline decoration-neutral-300 underline-offset-2">{x.numero}</Link>
                      {" · "}{x.brand}{x.oggetto ? ` · ${x.oggetto}` : ""} · firmato il {data(x.dataContratto)}{!soloMiei ? ` · ${x.commerciale}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {st && <span className={`rounded px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>}
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ring-1 ${CONSEGNA[sem].cls}`}>
                      🏁 {x.consegnaPrevista ? `consegna ${data(x.consegnaPrevista)} · ` : "consegna "}{CONSEGNA[sem].parola}
                    </span>
                  </div>
                </div>
                <div className="mt-3"><Stepper passi={x.passi} /></div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
                  <p className="text-sm text-neutral-800">
                    {x.corrente
                      ? <>👉 Adesso: <b>{x.corrente.nome}</b>{x.corrente.ufficio ? <> · {nomeUfficio(x.corrente.ufficio)}</> : null}</>
                      : x.stato === "ANNULLATA" ? "Pratica annullata" : FINITO(x.stato) ? "✅ Lavoro concluso" : "—"}
                  </p>
                  {puoConsegnareKit(x.stato) && (x.kitConsegnato
                    ? <span className="rounded bg-pink-50 px-2 py-0.5 text-xs font-semibold text-pink-800 ring-1 ring-pink-200">🎁 kit consegnato</span>
                    : <Link href={`/commesse/${x.id}#kit-cliente`} className="btn-3d btn-3d-pink px-3 py-1 text-xs">🎁 Registra il kit</Link>)}
                  <div className="min-w-[260px] flex-1 md:max-w-sm">
                    <div className="flex justify-between text-xs text-neutral-700">
                      <span>Pagato <b>{eur(x.pagato)}</b> di {eur(x.totale)}</span>
                      <span className="font-semibold">{perc}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-neutral-200"><div className={`h-2 rounded-full ${perc >= 100 ? "bg-green-600" : "bg-emerald-500"}`} style={{ width: `${perc}%` }} /></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const FINITO = (stato: string) => ["LAVORI_ESEGUITI", "CHIUSA"].includes(stato);
