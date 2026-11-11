// Obiettivi del mese e dell'anno del commerciale, con la tabella di marcia (in cima a «Contratti e provvigioni»).
import { obiettiviDi } from "@/lib/provvigioni/obiettivi-server";
import { NOMI_STATO_OBIETTIVO, nomePeriodo, vendutoPerMese, MESI, type Avanzamento } from "@/lib/provvigioni/obiettivi";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const COLORE: Record<string, string> = { RAGGIUNTO: "#16A34A", IN_LINEA: "#2563EB", VICINO: "#D97706", INDIETRO: "#DC2626", NON_INIZIATO: "#737373" };

function Barra({ titolo, av, premio, note }: { titolo: string; av: Avanzamento; premio: number | null; note: string | null }) {
  const pieno = Math.min(100, av.percentuale * 100);
  const segno = Math.min(100, (av.atteso / Math.max(1, av.target)) * 100);
  return (
    <div className="min-w-0 rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-neutral-900">{titolo}</p>
        <span className="text-xs font-semibold" style={{ color: COLORE[av.stato] }}>{NOMI_STATO_OBIETTIVO[av.stato]}</span>
      </div>
      <p className="text-xs text-neutral-600">
        Venduto <b className="text-neutral-900">{eur(av.venduto)}</b> di {eur(av.target)} ({Math.round(av.percentuale * 100)}%)
        {premio ? <> · premio <b className="text-neutral-900">{eur(premio)}</b></> : null}
      </p>
      <div className="relative mt-2 h-3 rounded-full bg-neutral-100" role="img" aria-label={`Venduto ${Math.round(av.percentuale * 100)}%, tabella di marcia ${Math.round(segno)}%`}>
        <div className="h-3 rounded-full" style={{ width: `${pieno}%`, background: COLORE[av.stato] }} />
        {av.stato !== "RAGGIUNTO" && <div className="absolute -top-1 h-5 w-0.5 bg-neutral-800" style={{ left: `${segno}%` }} title={`A oggi dovresti essere a ${eur(av.atteso)}`} />}
      </div>
      <p className="mt-1 text-[11px] text-neutral-600">
        {av.stato === "RAGGIUNTO" ? "Obiettivo raggiunto: complimenti! 🎉"
          : <>▍ tabella di marcia a oggi: {eur(av.atteso)} · {av.scarto >= 0 ? `avanti di ${eur(av.scarto)}` : `mancano ${eur(-av.scarto)} per essere in linea`} · all&apos;obiettivo mancano {eur(av.mancano)}{av.giorniRimasti > 0 ? ` (≈ ${eur(av.perSettimana)} a settimana)` : ""}</>}
      </p>
      {note && <p className="mt-1 text-[11px] text-neutral-500">📝 {note}</p>}
    </div>
  );
}

export default async function RiquadroObiettivi({ utenteId, contratti }: { utenteId: string; contratti: { data: Date | null; imponibile: number; commercialeId: string | null }[] }) {
  const suoi = contratti.filter((c) => c.commercialeId === utenteId);
  const ob = await obiettiviDi(utenteId, suoi);
  if (!ob.mese && !ob.anno) return null;
  const anno = ob.oggi.slice(0, 4);
  const mesi = vendutoPerMese(suoi, anno);
  const max = Math.max(1, ...mesi);
  const meseOggi = +ob.oggi.slice(5, 7);
  return (
    <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <h2 className="text-base font-extrabold text-neutral-900">🎯 Obiettivi</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {ob.mese && <Barra titolo={`📅 ${nomePeriodo(ob.mese.periodo)}`} av={ob.mese.av} premio={ob.mese.premio} note={ob.mese.note} />}
        {ob.anno && <Barra titolo={`📈 ${nomePeriodo(ob.anno.periodo)}`} av={ob.anno.av} premio={ob.anno.premio} note={ob.anno.note} />}
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-3">
        <p className="mb-2 text-xs font-semibold text-neutral-700">Venduto mese per mese ({anno})</p>
        <div className="flex h-24 items-end gap-1">
          {mesi.map((v, i) => (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`${MESI[i]}: ${eur(v)}`}>
              <div className="w-full max-w-8 rounded-t" style={{ height: `${Math.max(v > 0 ? 3 : 0, (v / max) * 80)}px`, background: i + 1 === meseOggi ? "#2563EB" : i + 1 < meseOggi ? "#93C5FD" : "#E5E5E5" }} />
              <span className="mt-0.5 text-[10px] text-neutral-500">{MESI[i].slice(0, 3)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
