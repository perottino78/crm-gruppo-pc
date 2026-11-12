export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { creaCampagna, puoFareCampagne, duplicaCampagna, eliminaCampagna } from "@/app/campagne-actions";
import BottoneConferma from "@/components/BottoneConferma";
import { giorniAllaScadenza, testoGiorni } from "@/lib/campagne/regole";

const STATO: Record<string, string> = { BOZZA: "📝 Bozza", PROGRAMMATA: "🕒 Programmata", IN_INVIO: "📤 In invio", INVIATA: "✅ Inviata" };

/** Campagne email di marketing: elenco con scadenze e risultati. */
export default async function CampagnePage({ searchParams }: { searchParams: Promise<{ errore?: string; ok?: string; tipo?: string }> }) {
  const u = await getCurrentUser();
  if (!(await puoFareCampagne(u))) notFound();
  const p = await searchParams;
  const soloAb = p.tipo === "ab";
  const nAb = await prisma.campagna.count({ where: { abTest: true } });
  const campagne = await prisma.campagna.findMany({
    where: soloAb ? { abTest: true } : {},
    orderBy: { createdAt: "desc" },
    include: { invii: { select: { stato: true, apertaIl: true, clicIl: true } }, _count: { select: { varianti: true } } },
  });
  const adesso = new Date();
  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">📣 Campagne</h1>
          <p className="text-sm text-neutral-600">Email promozionali ai clienti filtrati per marchio, stato (comprato, non interessato, visitato…) e provenienza. 3-2-1 giorni prima della scadenza arriva l&apos;avviso di aggiornarle.</p>
        </div>
        <form action={creaCampagna} className="flex gap-2">
          <input name="nome" required placeholder="Nome della campagna (es. Pergole primavera)" className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-72" />
          <button className="btn-3d btn-3d-green text-sm px-4 py-2">+ Nuova campagna</button>
        </form>
      </div>
      {p.errore === "permesso" && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">Le campagne le gestiscono l&apos;amministratore e l&apos;ufficio Marketing.</p>}
      {p.ok && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {p.ok}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/campagne" className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${!soloAb ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700"}`}>Tutte</Link>
        <Link href="/campagne?tipo=ab" className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${soloAb ? "border-purple-700 bg-purple-700 text-white" : "border-purple-300 bg-purple-50 text-purple-900"}`}>🧪 A/B test ({nAb})</Link>
        <form action={creaCampagna} className="ml-auto flex gap-2">
          <input type="hidden" name="ab" value="1" />
          <input name="nome" placeholder="Nome dell'A/B test" className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-56" />
          <button className="btn-3d btn-3d-purple text-sm px-4 py-2">+ Nuovo A/B test</button>
        </form>
      </div>
      {soloAb && <p className="text-xs text-neutral-600">A/B test: scegli il pubblico con i filtri, poi il numero di gruppi; i contatti si dividono in parti uguali e ogni gruppo riceve la sua versione (oggetto, preheader, testo). Nei risultati vedi quale gruppo apre e clicca di più.</p>}
      <div className="space-y-2">
        {campagne.map((c) => {
          const n = (s: string) => c.invii.filter((i) => i.stato === s).length;
          const g = c.validaFino ? giorniAllaScadenza(c.validaFino, adesso) : null;
          return (
            <div key={c.id} className="card-fase relative bg-white rounded-lg border border-neutral-200 p-4 hover:border-neutral-400">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/campagne/${c.id}`} className="font-semibold text-neutral-900 after:absolute after:inset-0">{c.abTest ? "🧪 " : ""}{c.nome} <span className="text-xs font-normal text-neutral-500">{STATO[c.stato] ?? c.stato}{c.stato === "PROGRAMMATA" && c.programmataIl ? ` il ${c.programmataIl.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}{c.abTest ? ` · A/B test, ${c._count.varianti} gruppi` : ""}</span></Link>
                {g !== null && <span className={`text-xs px-2 py-0.5 rounded-full ${g < 0 ? "bg-neutral-200 text-neutral-700" : g <= 3 ? "bg-red-100 text-red-800 font-semibold" : "bg-green-50 text-green-800"}`}>{g < 0 ? "scaduta" : `scade ${testoGiorni(g)}`} · {c.validaFino!.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</span>}
              </div>
              <p className="text-xs text-neutral-600 mt-1">
                {[c.marchi.join(", ") || "tutti i marchi", c.stati.join(", ") || "tutti gli stati", c.categorie.join(", ") || "lead e clienti"].join(" · ")}
              </p>
              {c.invii.length > 0 && <p className="text-xs text-neutral-700 mt-1">✉️ {n("INVIATA")} inviate · {n("IN_ATTESA") + n("IN_CORSO")} in coda · {n("FALLITA")} non inviate · {n("SOPPRESSA")} disiscritti
                {n("RIMBALZATA") > 0 && <span className="text-red-700"> · 📭 {n("RIMBALZATA")} rimbalzate</span>}{n("INVIATA") > 0 && <> · <b>👁 {Math.round((c.invii.filter((i) => i.apertaIl).length / n("INVIATA")) * 100)}% aperte</b> · <b>👆 {Math.round((c.invii.filter((i) => i.clicIl).length / n("INVIATA")) * 100)}% clic</b></>}</p>}
              <div className="relative z-10 mt-2 flex justify-end gap-2">
                <form action={duplicaCampagna}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="resta" value="1" /><button className="btn-3d btn-3d-outline px-3 py-1 text-xs">⧉ Duplica</button></form>
                <form action={eliminaCampagna}><input type="hidden" name="id" value={c.id} /><BottoneConferma messaggio={c.invii.length ? `Eliminare «${c.nome}»? Spariscono anche le statistiche e gli invii ancora in coda non partono.` : `Eliminare «${c.nome}»?`} className="btn-3d btn-3d-outline px-3 py-1 text-xs text-red-700">🗑 Elimina</BottoneConferma></form>
              </div>
            </div>
          );
        })}
        {campagne.length === 0 && <p className="text-sm text-neutral-600">Nessuna campagna ancora: creane una qui sopra.</p>}
      </div>
    </div>
  );
}
